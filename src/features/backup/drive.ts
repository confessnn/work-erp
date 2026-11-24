import "server-only";
import { folderUsable, getFile, createFolder } from "@/features/documents/drive";
import { GoogleApiError } from "@/features/google-calendar/google-api";
import { BACKUP_FOLDER_NAME, BACKUP_PREFIX, backupFileName, buildBackup, monthFolderName, type BackupFile } from "./backup";

/**
 * 백업 파일을 드라이브 work-erp/백업/<YYYY-MM>/ 에 주차별로 쌓는다. 지우지 않는다.
 * (drive.file 권한: ERP 가 만든 파일만 보고 쓸 수 있음)
 */
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

/** parent 아래 이름이 name 인 폴더 (없으면 만든다) */
async function childFolder(token: string, parent: string, name: string): Promise<string> {
  const found = await driveJson<{ files: { id: string }[] }>(
    token,
    `${API}/files?${new URLSearchParams({
      q: `name='${q(name)}' and mimeType='${FOLDER}' and '${q(parent)}' in parents and trashed=false`,
      fields: "files(id)",
      pageSize: "1",
    })}`,
  );
  return found.files[0]?.id ?? (await createFolder(token, name, parent)).id;
}

/** work-erp 최상위 폴더 (서류함 폴더의 부모) 아래 백업/<YYYY-MM> 폴더 */
async function monthFolder(token: string, docsFolderId: string, now: Date): Promise<string> {
  const root = (await getFile(token, docsFolderId)).parents?.[0];
  if (!root || !(await folderUsable(token, root))) {
    throw new Error("드라이브의 work-erp 폴더를 찾지 못했습니다. ERP의 '서류함'을 한 번 열어 폴더를 다시 만들어 주세요.");
  }
  const backups = await childFolder(token, root, BACKUP_FOLDER_NAME);
  return childFolder(token, backups, monthFolderName(now));
}

/** 최근 백업 파일 (모든 월 폴더에서, 새것부터) */
export async function listBackups(token: string, limit: number): Promise<BackupEntry[]> {
  const res = await driveJson<{ files: { id: string; name: string; createdTime: string; size?: string; webViewLink?: string }[] }>(
    token,
    `${API}/files?${new URLSearchParams({
      q: `name contains '${q(BACKUP_PREFIX)}' and mimeType='application/json' and trashed=false`,
      fields: "files(id,name,createdTime,size,webViewLink)",
      orderBy: "createdTime desc",
      pageSize: String(limit),
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

export type BackupResult = { name: string; folder: string; link: string | null; counts: BackupFile["counts"] };

/** DB 덤프 → 드라이브 백업/<YYYY-MM>/ 에 JSON 저장 */
export async function saveBackup(token: string, docsFolderId: string, dump: unknown, now = new Date()): Promise<BackupResult> {
  const backup = buildBackup(dump, now);
  const folder = await monthFolder(token, docsFolderId, now);
  const file = await uploadJson(token, folder, backupFileName(now), JSON.stringify(backup));
  return { name: file.name, folder: `${BACKUP_FOLDER_NAME}/${monthFolderName(now)}`, link: file.webViewLink ?? null, counts: backup.counts };
}
