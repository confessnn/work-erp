import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchProblem, notifiedIds, sendDigest, type DigestNotice, type DigestStatus } from "@/features/bid-inbox/digest";
import { buildMorning, buildMorningTelegram, MORNING_BUTTONS, nextDay, type AgendaItem, type MorningTodo } from "@/features/bid-inbox/morning";
import { sendChunks } from "@/features/telegram/api";
import { todayInSeoul } from "@/lib/format";
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

/** 텔레그램이 연결돼 있으면 보낸다. 연결 안 됨 = null, 실패 = 오류 문구 */
async function sendTelegram(db: SupabaseClient, secret: string, user: string, chunks: string[]): Promise<{ sent: boolean; error?: string } | null> {
  const { data, error } = await db.rpc("cron_telegram", { p_secret: secret, p_user: user });
  if (error) return { sent: false, error: `텔레그램 설정을 읽지 못했습니다: ${error.message}` };
  const [link] = (data ?? []) as { token: string | null; chat_id: number | null }[];
  if (!link?.token || !link.chat_id) return null;
  try {
    await sendChunks(link.token, link.chat_id, chunks, MORNING_BUTTONS);
    await db.rpc("cron_telegram_result", { p_secret: secret, p_user: user, p_error: null });
    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    await db.rpc("cron_telegram_result", { p_secret: secret, p_user: user, p_error: message });
    return { sent: false, error: `텔레그램 발송 실패: ${message}` };
  }
}

/**
 * 아침 '오늘 할 일': 오늘·내일 일정과 아직 알리지 않은 공고, 수신 문제를 매일 보낸다.
 * 텔레그램이 연결돼 있으면 텔레그램으로, 연결이 없거나 실패하면 메일로 보낸다.
 */
async function mailDigest(db: SupabaseClient, secret: string, user: string, summaryProblem: string | null) {
  const today = todayInSeoul();
  const [notices, status, agenda, todoRows, sharedRows, babyRows] = await Promise.all([
    db.rpc("cron_digest_notices", { p_secret: secret, p_user: user }),
    db.rpc("cron_bid_status", { p_secret: secret, p_user: user }),
    db.rpc("cron_morning_agenda", { p_secret: secret, p_user: user, p_from: today, p_to: nextDay(today) }),
    db.rpc("cron_morning_todos", { p_secret: secret, p_user: user, p_day: today }),
    // 가족(예: 아내)이 공유한 할 일
    db.rpc("cron_morning_shared_todos", { p_secret: secret, p_user: user, p_day: today }),
    // 아기 할 일 (부부 공용)
    db.rpc("cron_morning_baby_todos", { p_secret: secret, p_user: user, p_day: today }),
  ]);
  if (notices.error) throw new Error(notices.error.message);
  if (status.error) throw new Error(status.error.message);

  const rows = (notices.data ?? []) as DigestNotice[];
  const [latest] = (status.data ?? []) as DigestStatus[];
  const problems = [
    fetchProblem(latest ?? null, new Date()),
    summaryProblem,
    // 일정을 못 읽어도 공고 메일은 보낸다
    agenda.error ? `일정을 읽지 못했습니다: ${agenda.error.message}` : null,
    todoRows.error ? `할 일을 읽지 못했습니다: ${todoRows.error.message}` : null,
  ].flatMap((p) => (p ? [p] : []));
  const items = (agenda.data ?? []) as AgendaItem[];
  // 공유받은 할 일은 못 읽어도 아침 알림은 보낸다
  const todos = [
    ...((todoRows.data ?? []) as MorningTodo[]),
    ...((sharedRows.error ? [] : (sharedRows.data ?? [])) as MorningTodo[]),
    ...((babyRows.error ? [] : (babyRows.data ?? [])) as MorningTodo[]),
  ];

  const tg = await sendTelegram(db, secret, user, buildMorningTelegram(today, items, rows, problems, todos));
  let via = "텔레그램";
  if (!tg?.sent) {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.BID_NOTIFY_EMAIL;
    if (!apiKey || !to) return tg?.error ?? "보낼 곳 없음 (텔레그램 미연결, 메일 설정 없음)";
    await sendDigest(apiKey, to, buildMorning(today, items, rows, tg?.error ? [tg.error, ...problems] : problems, todos));
    via = "메일";
  }
  // 메일을 보낸 뒤에 기록한다. 기록이 실패하면 다음 날 한 번 더 받을 뿐 공고를 놓치지는 않는다
  const { error } = await db.rpc("cron_mark_notified", { p_secret: secret, p_user: user, p_ids: notifiedIds(rows) });
  if (error) throw new Error(error.message);
  return `${via} 발송 (공고 ${rows.length}건)`;
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
