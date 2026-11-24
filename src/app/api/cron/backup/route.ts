import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/features/google-calendar/crypto";
import { accessToken, DRIVE_SCOPE, hasScope } from "@/features/google-calendar/google-api";
import { backupSummary } from "@/features/backup/backup";
import { saveBackup } from "@/features/backup/drive";
import { isCronRequest } from "@/lib/cron-auth";

export const maxDuration = 60;

type Job = { user_id: string; refresh_token_enc: string; scopes: string | null; drive_docs_folder_id: string };

/**
 * 매주 Vercel Cron 이 호출 (vercel.json, 한국 시간 월요일 새벽 3시). Authorization: Bearer $CRON_SECRET 필수.
 * 대표 계정의 기록을 JSON 하나로 모아 그 사람 구글 드라이브 work-erp/백업/<YYYY-MM> 에 주차별로 쌓는다 (지우지 않음).
 * 결과는 backup_status 에 남기고, 실패하면 아침 7시 브리핑에 경고가 붙는다.
 * DB 읽기는 비밀값으로 잠긴 함수(cron_backup_*)로만 한다. service_role 키를 쓰지 않는다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isCronRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: jobs, error } = await db.rpc("cron_backup_jobs", { p_secret: secret });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results: { ok: boolean; file?: string; summary?: string; error?: string }[] = [];
  for (const job of (jobs ?? []) as Job[]) {
    try {
      if (!hasScope(job.scopes, DRIVE_SCOPE)) throw new Error("드라이브 권한이 없습니다.");
      const { token } = await accessToken(decryptSecret(job.refresh_token_enc), [DRIVE_SCOPE]);
      const { data: dump, error: e } = await db.rpc("cron_backup_dump", { p_secret: secret, p_user: job.user_id });
      if (e) throw new Error(e.message);
      const r = await saveBackup(token, job.drive_docs_folder_id, dump);
      const file = `${r.folder}/${r.name}`;
      await db.rpc("cron_backup_result", { p_secret: secret, p_user: job.user_id, p_file: file, p_error: null });
      results.push({ ok: true, file, summary: backupSummary(r.counts) });
    } catch (e) {
      const message = e instanceof Error ? e.message : "알 수 없는 오류";
      // 아침 7시 브리핑(bid-digest)이 이 기록을 보고 텔레그램·메일로 알린다
      await db.rpc("cron_backup_result", { p_secret: secret, p_user: job.user_id, p_file: null, p_error: message });
      results.push({ ok: false, error: message });
    }
  }
  const ok = results.every((r) => r.ok);
  if (!ok) console.error("백업 실패:", JSON.stringify(results));
  return Response.json({ ok, results }, { status: ok ? 200 : 500 });
}
