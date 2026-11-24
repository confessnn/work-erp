import "server-only";
import { driveContext } from "@/features/google-drive/context";
import { listBackups, type BackupEntry } from "./drive";

export type RecentBackups = { ok: true; files: BackupEntry[] } | { ok: false; error: string };

/** 설정 화면용 최근 백업 목록 (드라이브 work-erp/백업/<월> 전체에서 새것부터) */
export async function recentBackups(limit = 5): Promise<RecentBackups> {
  try {
    const ctx = await driveContext();
    return { ok: true, files: await listBackups(ctx.token, limit) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "백업 목록을 읽지 못했어요." };
  }
}
