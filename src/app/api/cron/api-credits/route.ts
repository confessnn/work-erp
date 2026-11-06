import { createClient } from "@supabase/supabase-js";
import { fetchDailyUsage } from "@/features/api-credits/fetch-usage";
import { PROVIDERS } from "@/features/api-credits/types";

export const maxDuration = 60;

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

  const { data: jobs, error } = await db.rpc("cron_api_credit_jobs", { p_secret: secret });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const usage = await Promise.all(
    PROVIDERS.map(async (p) => {
      try {
        return { provider: p.key, rows: await fetchDailyUsage(p.key), error: null };
      } catch (e) {
        return { provider: p.key, rows: null, error: e instanceof Error ? e.message : "알 수 없는 오류" };
      }
    }),
  );

  const results: { provider: string; days?: number; error?: string }[] = [];
  for (const job of (jobs ?? []) as { user_id: string }[]) {
    for (const u of usage) {
      // 키가 없는 서비스는 건너뛴다
      if (!u.rows && !u.error) continue;
      const { error: e } = await db.rpc("cron_save_api_usage", {
        p_secret: secret,
        p_user: job.user_id,
        p_provider: u.provider,
        p_rows: u.rows ?? [],
        p_error: u.error,
      });
      results.push({ provider: u.provider, days: u.rows?.length, error: e?.message ?? u.error ?? undefined });
    }
  }
  return Response.json({ ok: true, results });
}
