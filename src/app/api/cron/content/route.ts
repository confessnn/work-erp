import { createClient } from "@supabase/supabase-js";
import { contentTelegram } from "@/features/content/telegram";
import { resultText, runContent } from "@/features/content/run";
import { sendMessage } from "@/features/telegram/api";
import { isCronRequest } from "@/lib/cron-auth";

export const maxDuration = 300;

/**
 * 콘텐츠 창고 매일 수집 (vercel.json, 한국 시간 08:30쯤). Authorization: Bearer $CRON_SECRET 필수.
 * X 새 글 받기 → AI 정리 → 노션 기록 → 텔레그램 한 통. 새 글이 없으면 텔레그램은 보내지 않는다.
 * DB는 비밀값으로 잠긴 함수(content_*)로만 쓴다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: jobs, error } = await db.rpc("content_jobs", { p_secret: secret });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const started = Date.now();
  const list = (jobs ?? []) as { user_id: string }[];
  const results: string[] = [];
  for (const [i, job] of list.entries()) {
    // 남은 시간을 사람 수로 나눠 쓴다
    const deadline = started + ((i + 1) * 280_000) / list.length;
    try {
      const r = await runContent({ db, secret, user: job.user_id, deadline });
      results.push(resultText(r));
      if (r.added > 0 || r.problems.length) {
        const { data: tg } = await db.rpc("cron_telegram", { p_secret: secret, p_user: job.user_id });
        const [link] = (tg ?? []) as { token: string | null; chat_id: number | null }[];
        if (link?.token && link.chat_id) {
          const m = contentTelegram(r);
          await sendMessage(link.token, Number(link.chat_id), m.html, m.buttons).catch(() => {});
        }
      }
    } catch (e) {
      results.push(`오류: ${e instanceof Error ? e.message : "알 수 없음"}`);
    }
  }
  return Response.json({ ok: true, results });
}
