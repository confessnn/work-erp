import "server-only";
import { driveContext } from "@/features/google-drive/context";
import { backupProblem } from "./backup";
import { listBackups, type BackupEntry } from "./drive";

export type RecentBackups = { ok: true; files: BackupEntry[]; warning: string | null } | { ok: false; error: string };

/**
 * 설정 화면용 최근 백업 목록 (드라이브 work-erp/백업/<월> 전체에서 새것부터)
 * + 아침 브리핑과 같은 기준의 경고 (최근 백업 실패·8일 넘게 밀림)
 */
export async function recentBackups(limit = 5): Promise<RecentBackups> {
  try {
    const ctx = await driveContext();
    const [files, { data: status }] = await Promise.all([
      listBackups(ctx.token, limit),
      ctx.supabase.from("backup_status").select("last_ok_at, last_error, last_error_at").maybeSingle(),
    ]);
    // 기록이 아직 없으면(첫 백업 전) 경고 대신 목록의 '아직 백업이 없어요'로 안내
    const warning = status ? backupProblem({ applicable: true, ...status }, new Date()) : null;
    return { ok: true, files, warning };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "백업 목록을 읽지 못했어요." };
  }
}
