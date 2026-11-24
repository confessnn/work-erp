import "server-only";
import { folderUsable, getFile, createFolder, trashFile } from "@/features/documents/drive";
import { GoogleApiError } from "@/features/google-calendar/google-api";
import { BACKUP_FOLDER_NAME, backupFileName, buildBackup, filesToPrune, type BackupFile } from "./backup";

/** 백업 파일을 work-erp/백업 폴더에 둔다 (drive.file 권한: ERP 가 만든 파일만 보고 쓸 수 있음) */
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

export type BackupEntry = { id: string; name: string; createdTime: string; size: number | null; webViewLink: string | null };

async function driveJson<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleApiError(res.status, json?.error?.message ?? `드라이브 오류 ${res.status}`);
  return json as T;
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** work-erp 최상위 폴더 (서류함 폴더의 부모) 아래 '백업' 폴더. create 면 없을 때 만들고, 아니면 null */
export async function backupFolder(token: string, docsFolderId: string, create: false): Promise<string | null>;
export async function backupFolder(token: string, docsFolderId: string, create?: true): Promise<string>;
export async function backupFolder(token: string, docsFolderId: string, create = true): Promise<string | null> {
  const root = (await getFile(token, docsFolderId)).parents?.[0];
  if (!root || !(await folderUsable(token, root))) {
    throw new Error("드라이브의 work-erp 폴더를 찾지 못했습니다. ERP의 '서류함'을 한 번 열어 폴더를 다시 만들어 주세요.");
  }
  const found = await driveJson<{ files: { id: string }[] }>(
    token,
    `${API}/files?${new URLSearchParams({
      q: `name='${q(BACKUP_FOLDER_NAME)}' and mimeType='${FOLDER}' and '${q(root)}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: "1",
    })}`,
  );
  if (found.files[0]) return found.files[0].id;
  if (!create) return null;
  return (await createFolder(token, BACKUP_FOLDER_NAME, root)).id;
}

export async function listBackups(token: string, folderId: string): Promise<BackupEntry[]> {
  const res = await driveJson<{ files: { id: string; name: string; createdTime: string; size?: string; webViewLink?: string }[] }>(
    token,
    `${API}/files?${new URLSearchParams({
      q: `'${q(folderId)}' in parents and trashed=false`,
      fields: "files(id,name,createdTime,size,webViewLink)",
      orderBy: "name desc",
      pageSize: "200",
    })}`,
  );
  return res.files.map((f) => ({ id: f.id, name: f.name, createdTime: f.createdTime, size: f.size ? Number(f.size) : null, webViewLink: f.webViewLink ?? null }));
}

async function uploadJson(token: string, folderId: string, name: string, body: string) {
  const boundary = `erp-backup-${crypto.randomUUID()}`;
  const multipart =
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [folderId], mimeType: "application/json" }) +
    `\r\n--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n` +
    body +
    `\r\n--${boundary}--`;
  return driveJson<{ id: string; name: string; webViewLink?: string }>(token, `${UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
}

export type BackupResult = { name: string; link: string | null; counts: BackupFile["counts"]; pruned: number };

/** DB 덤프 → 드라이브에 JSON 저장 → 오래된 백업 정리 */
export async function saveBackup(token: string, docsFolderId: string, dump: unknown, now = new Date()): Promise<BackupResult> {
  const backup = buildBackup(dump, now);
  const folder = await backupFolder(token, docsFolderId);
  const file = await uploadJson(token, folder, backupFileName(now), JSON.stringify(backup));

  // 정리 실패는 백업 실패가 아니다 (다음 번에 다시 정리됨)
  let pruned = 0;
  try {
    for (const old of filesToPrune(await listBackups(token, folder))) {
      await trashFile(token, old.id);
      pruned++;
    }
  } catch (e) {
    console.error("오래된 백업 정리 실패:", e instanceof Error ? e.message : e);
  }
  return { name: file.name, link: file.webViewLink ?? null, counts: backup.counts, pruned };
}
