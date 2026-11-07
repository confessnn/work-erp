import "server-only";
import { createClient } from "@supabase/supabase-js";
import { todayInSeoul } from "@/lib/format";
import { fetchImportRows, STALE_MINUTES } from "./import";

type Job = { id: string; family_id: string; ics_url: string; last_synced_at: string | null };

/**
 * 가족 구성원들이 연결한 구글 캘린더를 가져온다 (비밀값으로 잠긴 cron_* 함수 사용, service_role 키 없음).
 * - 매일 크론: 전체
 * - 가족 달력을 열 때: 그 가족 것 중 30분 넘게 안 가져온 것만 (응답 후 after()로)
 */
export async function importFamilySources(opts: { familyId?: string; staleOnly?: boolean } = {}) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return [];
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("cron_family_sources", { p_secret: secret });
  if (error) throw new Error(error.message);

  const cutoff = Date.now() - STALE_MINUTES * 60_000;
  const jobs = ((data ?? []) as Job[]).filter(
    (j) =>
      (!opts.familyId || j.family_id === opts.familyId) &&
      (!opts.staleOnly || !j.last_synced_at || Date.parse(j.last_synced_at) < cutoff),
  );

  const today = todayInSeoul();
  const results: { source: string; added?: number; error?: string }[] = [];
  for (const job of jobs) {
    try {
      const { from, rows } = await fetchImportRows(job.ics_url, today);
      const { data: n, error: e } = await db.rpc("cron_save_family_import", {
        p_secret: secret,
        p_source: job.id,
        p_from: from,
        p_rows: rows,
        p_result: null,
      });
      if (e) throw new Error(e.message);
      results.push({ source: job.id, added: Number(n) || 0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "알 수 없는 오류";
      await db.rpc("cron_save_family_import", {
        p_secret: secret,
        p_source: job.id,
        p_from: today,
        p_rows: null,
        p_result: `자동 가져오기 실패: ${msg}`,
      });
      results.push({ source: job.id, error: msg });
    }
  }
  return results;
}
