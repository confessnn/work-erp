import { createClient } from "@supabase/supabase-js";
import { collectAutoImport, type ExistingLecture, type ImportSettings } from "@/features/calendar-import/sync";
import { rememberedFees, withRememberedFee, type FeeRecord } from "@/features/lectures/fee-memory";
import { todayInSeoul } from "@/lib/format";

export const maxDuration = 60;

type Job = ImportSettings & { source_id: string; user_id: string; ics_url: string };

/**
 * 매일 Vercel Cron 이 호출 (vercel.json). Authorization: Bearer $CRON_SECRET 필수.
 * DB 쓰기는 비밀값으로 잠긴 함수(cron_*)로만 한다. service_role 키를 쓰지 않는다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: jobs, error } = await db.rpc("cron_sync_jobs", { p_secret: secret });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const today = todayInSeoul();
  const knownByUser = new Map<string, Set<string>>();
  const results: { source: string; added?: number; linked?: number; error?: string }[] = [];

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
      const { rows: collected, links } = await collectAutoImport(job.ics_url, job, known, (existing ?? []) as ExistingLecture[], today);
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
      const { data: added, error: e } = await db.rpc("cron_save_import", {
        p_secret: secret,
        p_source: job.source_id,
        p_rows: rows,
        p_result: null,
      });
      if (e) throw new Error(e.message);
      rows.forEach((r) => known.add(r.external_uid));
      results.push({ source: job.source_id, added: Number(added) || 0, linked: links.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "알 수 없는 오류";
      await db.rpc("cron_save_import", { p_secret: secret, p_source: job.source_id, p_rows: [], p_result: `자동 실패: ${msg}` });
      results.push({ source: job.source_id, error: msg });
    }
  }

  return Response.json({ ok: true, results });
}
