import { createClient } from "@supabase/supabase-js";
import { collectAutoImportRows, type ImportSettings } from "@/features/calendar-import/sync";
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
  const results: { source: string; added?: number; error?: string }[] = [];

  for (const job of (jobs ?? []) as Job[]) {
    try {
      let known = knownByUser.get(job.user_id);
      if (!known) {
        const { data, error: e } = await db.rpc("cron_known_uids", { p_secret: secret, p_user: job.user_id });
        if (e) throw new Error(e.message);
        known = new Set((data ?? []) as string[]);
        knownByUser.set(job.user_id, known);
      }
      const rows = await collectAutoImportRows(job.ics_url, job, known, today);
      const { data: added, error: e } = await db.rpc("cron_save_import", {
        p_secret: secret,
        p_source: job.source_id,
        p_rows: rows,
        p_result: null,
      });
      if (e) throw new Error(e.message);
      rows.forEach((r) => known.add(r.external_uid));
      results.push({ source: job.source_id, added: Number(added) || 0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "알 수 없는 오류";
      await db.rpc("cron_save_import", { p_secret: secret, p_source: job.source_id, p_rows: [], p_result: `자동 실패: ${msg}` });
      results.push({ source: job.source_id, error: msg });
    }
  }

  return Response.json({ ok: true, results });
}
