import { createClient } from "@supabase/supabase-js";
import { noticeMaterial, summaryNotes, SUMMARY_SYSTEM } from "@/features/bid-inbox/summarize";
import type { BidFile } from "@/features/bid-inbox/types";

/**
 * 맥 워커가 공고를 요약할 때 쓰는 두 걸음.
 *
 *   action "next" → 요약 안 된 공고 하나의 '재료'를 준다 (요약은 하지 않는다)
 *   action "save" → 워커가 만든 요약을 저장한다
 *
 * 왜 이렇게 갈랐나: 서버만 할 수 있는 일(나라장터 첨부 목록 조회·한글 파일 해석)과
 * 아무 데서나 할 수 있는 일(요약)이 다르다. 요약을 워커가 하면 구독 한도로 돌아
 * ANTHROPIC_API_KEY 요금이 들지 않는다. 그리고 Vercel 300초 제한에도 걸리지 않는다.
 *
 * 워커 확인은 워커 전용 비밀값(cron_lab_check)으로만 한다. 워커에는 CRON_SECRET 을 주지 않는다.
 */
export const maxDuration = 300;

type Pending = { id: string; bid_no: string; bid_ord: string; title: string };
type Body = {
  user?: string;
  action?: "next" | "save";
  id?: string;
  summary?: string;
  files?: BidFile[];
  error?: string;
};

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "서버에 CRON_SECRET 이 없습니다" }, { status: 500 });

  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.user) return Response.json({ ok: false, error: "user 가 없습니다" }, { status: 400 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await db.rpc("cron_lab_check", { p_secret: given });
  if (authError) return new Response("Unauthorized", { status: 401 });

  if (body.action === "save") {
    if (!body.id) return Response.json({ ok: false, error: "id 가 없습니다" }, { status: 400 });
    if (!body.summary && !body.error) {
      return Response.json({ ok: false, error: "summary 나 error 중 하나는 있어야 합니다" }, { status: 400 });
    }
    const { error } = await db.rpc("cron_save_summary", {
      p_secret: secret,
      p_user: body.user,
      p_id: body.id,
      p_summary: body.summary ?? null,
      p_files: body.files ?? null,
      p_error: body.error ?? null,
    });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, saved: body.id });
  }

  const { data, error } = await db.rpc("cron_pending_summaries", { p_secret: secret, p_user: body.user });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const pending = (data ?? []) as Pending[];
  if (pending.length === 0) return Response.json({ ok: true, notice: null, remaining: 0 });

  const notice = pending[0];
  const remaining = pending.length - 1;

  // 첨부를 못 받는 공고(국방부 등)는 여기서 실패로 적어 둔다. 그래야 다음 공고로 넘어간다
  let material;
  try {
    material = await noticeMaterial(notice.bid_no, notice.bid_ord);
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    await db.rpc("cron_save_summary", {
      p_secret: secret,
      p_user: body.user,
      p_id: notice.id,
      p_summary: null,
      p_files: null,
      p_error: message,
    });
    return Response.json({ ok: true, notice: null, skipped: { title: notice.title, error: message }, remaining });
  }

  return Response.json({
    ok: true,
    notice: {
      id: notice.id,
      title: notice.title,
      instructions: SUMMARY_SYSTEM,
      texts: material.texts,
      pdfs: material.pdfs,
      unread: material.unread,
      files: material.files,
      // 요약 끝에 붙일 줄을 서버가 만들어 준다 (서버가 직접 요약할 때와 같은 꼴을 쓰도록)
      notes: summaryNotes([...material.texts.map((t) => t.name), ...material.pdfs.map((f) => f.name)], material.unread),
    },
    remaining,
  });
}
