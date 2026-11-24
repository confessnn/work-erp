import { createClient } from "@supabase/supabase-js";
import {
  collectAutoImport,
  collectRemovals,
  type ExistingLecture,
  type ImportSettings,
  type RemovalContext,
} from "@/features/calendar-import/sync";
import type { CalendarEvent } from "@/features/calendar-import/ics";
import { rememberedFees, withRememberedFee, type FeeRecord } from "@/features/lectures/fee-memory";
import { todayInSeoul } from "@/lib/format";
import { importFamilySources } from "@/features/family/auto-import";
import { isCronRequest } from "@/lib/cron-auth";

export const maxDuration = 60;

type Job = ImportSettings & { source_id: string; user_id: string; ics_url: string };

/**
 * 매일 Vercel Cron 이 호출 (vercel.json). Authorization: Bearer $CRON_SECRET 필수.
 * DB 쓰기는 비밀값으로 잠긴 함수(cron_*)로만 한다. service_role 키를 쓰지 않는다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: jobs, error } = await db.rpc("cron_sync_jobs", { p_secret: secret });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const today = todayInSeoul();
  const knownByUser = new Map<string, Set<string>>();
  const results: { source: string; added?: number; linked?: number; updated?: number; error?: string }[] = [];
  /** 사용자별로 이번에 받아온 캘린더 일정 (구글에서 지운 강의 판단용, 못 받았으면 null) */
  const fetched = new Map<string, Map<string, CalendarEvent[] | null>>();
  const failedUsers = new Set<string>();

  for (const job of (jobs ?? []) as Job[]) {
    try {
      let known = knownByUser.get(job.user_id);
      if (!known) {
        const { data, error: e } = await db.rpc("cron_known_uids", { p_secret: secret, p_user: job.user_id });
        if (e) throw new Error(e.message);
        known = new Set((data ?? []) as string[]);
        knownByUser.set(job.user_id, known);
      }
      const { data: existing, error: e0 } = await db.rpc("cron_existing_lectures", { p_secret: secret, p_user: job.user_id });
      if (e0) throw new Error(e0.message);
      const { rows: collected, links, updates, events } = await collectAutoImport(job.ics_url, job, known, (existing ?? []) as ExistingLecture[], today);
      // 같은 제목의 일정에 입력해 둔 강의료를 새 일정에 넣는다
      const { data: feeRecords, error: e2 } = await db.rpc("cron_lecture_fees", { p_secret: secret, p_user: job.user_id });
      if (e2) throw new Error(e2.message);
      const fees = rememberedFees((feeRecords ?? []) as FeeRecord[]);
      const rows = collected.map((r) => withRememberedFee(r, fees));
      // ERP에 이미 있는 강의 → 구글 원본과 연결 (ERP 캘린더 사본은 지울 대상으로)
      if (links.length) {
        const { error: e1 } = await db.rpc("cron_link_lectures", { p_secret: secret, p_user: job.user_id, p_links: links });
        if (e1) throw new Error(e1.message);
        links.forEach((x) => known.add(x.external_uid));
      }
      // 이미 불러온 강의인데 구글에서 날짜·시간이 바뀜 → ERP 강의 시간(과 시간당 강의료) 고치기
      let updated = 0;
      if (updates.length) {
        const { data: n, error: e3 } = await db.rpc("cron_update_lectures", { p_secret: secret, p_user: job.user_id, p_rows: updates });
        if (e3) throw new Error(e3.message);
        updated = Number(n) || 0;
        updates.forEach((x) => known.add(x.external_uid));
      }
      const { data: added, error: e } = await db.rpc("cron_save_import", {
        p_secret: secret,
        p_source: job.source_id,
        p_rows: rows,
        p_result: updated ? `자동: ${rows.length}건 새로 추가 · ${updated}건 시간 변경 반영` : null,
      });
      if (e) throw new Error(e.message);
      rows.forEach((r) => known.add(r.external_uid));
      results.push({ source: job.source_id, added: Number(added) || 0, linked: links.length, updated });
      if (!fetched.has(job.user_id)) fetched.set(job.user_id, new Map());
      fetched.get(job.user_id)!.set(job.source_id, events);
    } catch (e) {
      failedUsers.add(job.user_id);
      const msg = e instanceof Error ? e.message : "알 수 없는 오류";
      await db.rpc("cron_save_import", { p_secret: secret, p_source: job.source_id, p_rows: [], p_result: `자동 실패: ${msg}` });
      results.push({ source: job.source_id, error: msg });
    }
  }

  // 구글 캘린더에서 지운 일정 → ERP 강의도 지우기 (사용자의 모든 캘린더를 다 받아왔을 때만)
  const removed: { user: string; removed?: number; skipped?: string; error?: string }[] = [];
  for (const [user, already] of fetched) {
    if (failedUsers.has(user)) {
      removed.push({ user, skipped: "불러오기 실패가 있어 건너뜀" });
      continue;
    }
    try {
      const { data: ctx, error: e } = await db.rpc("cron_removal_context", { p_secret: secret, p_user: user });
      if (e) throw new Error(e.message);
      const { ids, blocked } = await collectRemovals(ctx as RemovalContext, already, today);
      if (blocked) {
        removed.push({ user, skipped: blocked });
        continue;
      }
      if (!ids.length) continue;
      const { data: n, error: e1 } = await db.rpc("cron_remove_gone_lectures", { p_secret: secret, p_user: user, p_ids: ids });
      if (e1) throw new Error(e1.message);
      removed.push({ user, removed: Number(n) || 0 });
    } catch (e) {
      removed.push({ user, error: e instanceof Error ? e.message : "알 수 없는 오류" });
    }
  }

  // 가족 구성원이 연결한 구글 캘린더 → 가족 달력
  let family: unknown;
  try {
    family = await importFamilySources();
  } catch (e) {
    family = { error: e instanceof Error ? e.message : "알 수 없는 오류" };
  }

  return Response.json({ ok: true, results, removed, family });
}
