import "server-only";
import { driveContext } from "@/features/google-drive/context";
import { backupFolder, listBackups, type BackupEntry } from "./drive";

export type RecentBackups = { ok: true; files: BackupEntry[] } | { ok: false; error: string };

/** 설정 화면용 최근 백업 목록 (드라이브 work-erp/백업). 폴더가 아직 없으면 빈 목록 */
export async function recentBackups(limit = 5): Promise<RecentBackups> {
  try {
    const ctx = await driveContext();
    const folder = await backupFolder(ctx.token, ctx.folders.docs, false);
    if (!folder) return { ok: true, files: [] };
    const files = (await listBackups(ctx.token, folder)).filter((f) => f.name.endsWith(".json"));
    return { ok: true, files: files.slice(0, limit) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "백업 목록을 읽지 못했어요." };
  }
}
