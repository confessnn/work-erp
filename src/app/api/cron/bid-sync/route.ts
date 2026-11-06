import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchAllNotices } from "@/features/bid-inbox/fetch-all";
import { summarizeNotice } from "@/features/bid-inbox/summarize";

export const maxDuration = 300;

/** 이 시간이 지나면 새 요약을 시작하지 않는다. 남은 공고는 다음 수신 때 이어서 한다 */
const SUMMARY_START_LIMIT_MS = 90_000;

/** 아직 요약이 없는 원가 공고를 하나씩 요약한다. 실패해도 수신 결과에는 영향이 없다 */
async function summarizePending(db: SupabaseClient, secret: string, user: string, startedAt: number) {
  if (!process.env.ANTHROPIC_API_KEY) return 0;
  const { data, error } = await db.rpc("cron_pending_summaries", { p_secret: secret, p_user: user });
  if (error) throw new Error(error.message);

  let done = 0;
  for (const n of (data ?? []) as { id: string; bid_no: string; bid_ord: string; title: string }[]) {
    if (Date.now() - startedAt > SUMMARY_START_LIMIT_MS) break;
    const saved = await summarizeNotice(n.bid_no, n.bid_ord, n.title).then(
      (r) => ({ p_summary: r.summary, p_files: r.files, p_error: null }),
      (e) => ({ p_summary: null, p_files: null, p_error: e instanceof Error ? e.message : "알 수 없는 오류" }),
    );
    const { error: e2 } = await db.rpc("cron_save_summary", { p_secret: secret, p_user: user, p_id: n.id, ...saved });
    if (e2) throw new Error(e2.message);
    if (saved.p_summary) done++;
  }
  return done;
}

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

  const { data: jobs, error } = await db.rpc("cron_bid_jobs", { p_secret: secret });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const startedAt = Date.now();
  const results: { added?: number; failures?: string[]; summarized?: number; error?: string }[] = [];
  for (const job of (jobs ?? []) as { user_id: string }[]) {
    try {
      const { data: known, error: e0 } = await db.rpc("cron_bid_checked", { p_secret: secret, p_user: job.user_id });
      if (e0) throw new Error(e0.message);

      const fetched = await fetchAllNotices(new Set((known ?? []) as string[]));
      const failures = fetched.filter((r) => r.error).map((r) => `${r.label}: ${r.error}`);
      const { data: added, error: e1 } = await db.rpc("cron_save_bids", {
        p_secret: secret,
        p_user: job.user_id,
        p_rows: fetched.flatMap((r) => r.rows),
        p_checked: fetched.flatMap((r) => r.checked ?? []),
        p_result: failures.length ? `자동 실패: ${failures.join(" / ")}` : null,
      });
      if (e1) throw new Error(e1.message);
      results.push({ added: Number(added) || 0, failures, summarized: await summarizePending(db, secret, job.user_id, startedAt) });
    } catch (e) {
      results.push({ error: e instanceof Error ? e.message : "알 수 없는 오류" });
    }
  }

  return Response.json({ ok: true, results });
}
