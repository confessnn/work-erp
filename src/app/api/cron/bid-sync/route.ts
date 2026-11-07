import { createClient } from "@supabase/supabase-js";
import { fetchAllNotices } from "@/features/bid-inbox/fetch-all";

export const maxDuration = 300;

/**
 * 매일 Vercel Cron 이 호출 (vercel.json). Authorization: Bearer $CRON_SECRET 필수.
 * 공고만 받는다. 요약과 메일은 다음 시간대의 bid-digest가 한다.
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

  const results: { added?: number; failures?: string[]; error?: string }[] = [];
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
      results.push({ added: Number(added) || 0, failures });
    } catch (e) {
      results.push({ error: e instanceof Error ? e.message : "알 수 없는 오류" });
    }
  }

  return Response.json({ ok: true, results });
}
