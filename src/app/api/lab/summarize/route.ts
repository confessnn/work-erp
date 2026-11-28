import { createClient } from "@supabase/supabase-js";
import { summarizeNotice } from "@/features/bid-inbox/summarize";

/**
 * 요약이 없는 원가 공고를 '한 건만' 요약한다.
 *
 * 왜 한 건만인가: 요약 1건은 길면 230초쯤 걸리는데 Vercel 함수는 300초에서 끊긴다.
 * 그래서 아침 크론(bid-digest)은 하루 한 건밖에 못 하고 공고가 요약 없이 밀린다.
 * 이 라우트는 한 번에 한 건만 끝내고 남은 수를 알려 주고, 맥에서 도는 워커가
 * 남은 수가 0이 될 때까지 다시 부른다 — 시간 제한이 없는 쪽이 반복을 맡는 구조다.
 *
 * 워커 확인은 워커 전용 비밀값(cron_lab_check)으로만 한다. 워커에는 CRON_SECRET 을 주지 않는다.
 */
export const maxDuration = 300;

type Pending = { id: string; bid_no: string; bid_ord: string; title: string };

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "서버에 CRON_SECRET 이 없습니다" }, { status: 500 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: "서버에 ANTHROPIC_API_KEY 가 없습니다" }, { status: 500 });
  }

  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const body = (await request.json().catch(() => ({}))) as { user?: string };
  if (!body.user) return Response.json({ ok: false, error: "user 가 없습니다" }, { status: 400 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await db.rpc("cron_lab_check", { p_secret: given });
  if (authError) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await db.rpc("cron_pending_summaries", { p_secret: secret, p_user: body.user });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const pending = (data ?? []) as Pending[];
  if (pending.length === 0) return Response.json({ ok: true, done: 0, remaining: 0 });

  const notice = pending[0];
  const saved = await summarizeNotice(notice.bid_no, notice.bid_ord, notice.title).then(
    (r) => ({ p_summary: r.summary, p_files: r.files, p_error: null }),
    (e) => ({ p_summary: null, p_files: null, p_error: e instanceof Error ? e.message : "알 수 없는 오류" }),
  );

  const { error: saveError } = await db.rpc("cron_save_summary", {
    p_secret: secret,
    p_user: body.user,
    p_id: notice.id,
    ...saved,
  });
  if (saveError) return Response.json({ ok: false, error: saveError.message }, { status: 500 });

  return Response.json({
    ok: true,
    done: saved.p_summary ? 1 : 0,
    failed: saved.p_error,
    title: notice.title,
    remaining: pending.length - 1,
  });
}
