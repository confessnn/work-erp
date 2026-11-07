import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildDigest, fetchProblem, notifiedIds, sendDigest, type DigestNotice, type DigestStatus } from "@/features/bid-inbox/digest";
import { summarizeNotice } from "@/features/bid-inbox/summarize";

export const maxDuration = 300;

/**
 * 이 시간이 지나면 새 요약을 시작하지 않는다. 남은 공고는 메일에 '요약 대기'로 알리고 다음 날 이어서 한다.
 * 요약 1건은 길면 230초쯤 걸리므로, 300초 안에 메일까지 보내려면 이보다 늦게 시작하면 안 된다.
 */
const SUMMARY_START_LIMIT_MS = 60_000;

/** 아직 요약이 없는 원가 공고를 하나씩 요약한다 */
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

/** 아직 알리지 않은 공고와 수신 문제를 메일로 보낸다. 보낼 내용이 없으면 보내지 않는다 */
async function mailDigest(db: SupabaseClient, secret: string, user: string, summaryProblem: string | null) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BID_NOTIFY_EMAIL;
  if (!apiKey || !to) return "메일 설정 없음";

  const [notices, status] = await Promise.all([
    db.rpc("cron_digest_notices", { p_secret: secret, p_user: user }),
    db.rpc("cron_bid_status", { p_secret: secret, p_user: user }),
  ]);
  if (notices.error) throw new Error(notices.error.message);
  if (status.error) throw new Error(status.error.message);

  const rows = (notices.data ?? []) as DigestNotice[];
  const [latest] = (status.data ?? []) as DigestStatus[];
  const problems = [fetchProblem(latest ?? null, new Date()), summaryProblem].flatMap((p) => (p ? [p] : []));
  const mail = buildDigest(rows, problems);
  if (!mail) return "보낼 내용 없음";

  await sendDigest(apiKey, to, mail);
  // 메일을 보낸 뒤에 기록한다. 기록이 실패하면 다음 날 한 번 더 받을 뿐 공고를 놓치지는 않는다
  const { error } = await db.rpc("cron_mark_notified", { p_secret: secret, p_user: user, p_ids: notifiedIds(rows) });
  if (error) throw new Error(error.message);
  return `${rows.length}건 발송`;
}

/**
 * 매일 Vercel Cron 이 호출 (vercel.json). Authorization: Bearer $CRON_SECRET 필수.
 * 요약이 공고 수신 시간에 밀려 빠지지 않도록 수신(bid-sync) 다음 시간대에 따로 돈다.
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
  const results: { summarized?: number; mail?: string; error?: string }[] = [];
  for (const job of (jobs ?? []) as { user_id: string }[]) {
    let summarized = 0;
    let summaryProblem: string | null = null;
    try {
      summarized = await summarizePending(db, secret, job.user_id, startedAt);
    } catch (e) {
      // 요약이 멈춰도 메일은 보내고, 멈춘 사실을 메일에 적는다
      summaryProblem = `요약 처리 오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`;
    }
    try {
      results.push({ summarized, mail: await mailDigest(db, secret, job.user_id, summaryProblem) });
    } catch (e) {
      results.push({ summarized, error: e instanceof Error ? e.message : "알 수 없는 오류" });
    }
  }

  return Response.json({ ok: true, results });
}
