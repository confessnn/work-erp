import { createClient } from "@supabase/supabase-js";
import { exportForJob, type BrainJob } from "@/features/brain/cron-export";
import { isCronRequest } from "@/lib/cron-auth";

export const maxDuration = 60;

/**
 * 매일 Vercel Cron 이 호출 (vercel.json, 한국 시간 새벽 5시). Authorization: Bearer $CRON_SECRET 필수.
 * 세컨드브레인 볼트가 있는 사람의 일정 기록·할 일을 볼트 'ERP 기록' 폴더에 노트로 내보낸다 (바뀐 것만).
 * DB 읽기·쓰기는 비밀값으로 잠긴 함수(cron_brain_*)로만 한다. service_role 키를 쓰지 않는다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: jobs, error } = await db.rpc("cron_brain_jobs", { p_secret: secret });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results: { ok: boolean; records?: unknown; todos?: unknown; error?: string }[] = [];
  for (const job of (jobs ?? []) as BrainJob[]) {
    try {
      results.push({ ok: true, ...(await exportForJob(db, secret, job)) });
    } catch (e) {
      results.push({ ok: false, error: e instanceof Error ? e.message : "알 수 없는 오류" });
    }
  }
  const ok = results.every((r) => r.ok);
  if (!ok) console.error("세컨드브레인 자동 내보내기 실패:", JSON.stringify(results));
  return Response.json({ ok, results }, { status: ok ? 200 : 500 });
}
