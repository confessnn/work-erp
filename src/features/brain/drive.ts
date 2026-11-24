import "server-only";
import { GoogleApiError } from "@/features/google-calendar/google-api";
import { isNotePath } from "./vault";

/**
 * 세컨드브레인용 드라이브 API.
 * 읽기: drive.readonly (사용자가 옵시디언·드라이브 앱으로 만든 노트도 읽는다)
 * 쓰기: drive.file (ERP가 만든 폴더·파일만. 사용자가 만든 폴더 안에는 새 파일을 못 만들 수 있다)
 */
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleApiError(res.status, json?.error?.message ?? `드라이브 오류 ${res.status}`);
  return json as T;
}

type Item = { id: string; name: string; mimeType: string; modifiedTime: string };

/** 폴더 바로 아래 항목 (휴지통 제외) */
export async function listChildren(token: string, folderId: string): Promise<Item[]> {
  const out: Item[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    const r = await call<{ files?: Item[]; nextPageToken?: string }>(token, `${API}/files?${q}`);
    out.push(...(r.files ?? []));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

/** 볼트가 너무 크면 멈춘다 (개인 볼트로는 넉넉한 크기) */
const MAX_FOLDERS = 800;

/** 볼트 안의 모든 .md 노트 (숨김 폴더 .obsidian·.trash 는 건너뜀). 경로는 볼트 기준 */
export async function listVaultNotes(token: string, rootId: string): Promise<{ id: string; path: string; modifiedTime: string }[]> {
  const notes: { id: string; path: string; modifiedTime: string }[] = [];
  const queue: { id: string; prefix: string }[] = [{ id: rootId, prefix: "" }];
  let folders = 0;
  while (queue.length) {
    // 폴더 몇 개씩 동시에 읽는다
    const batch = queue.splice(0, 6);
    folders += batch.length;
    if (folders > MAX_FOLDERS) throw new Error(`볼트의 폴더가 너무 많아요 (${MAX_FOLDERS}개 넘음).`);
    const results = await Promise.all(batch.map(async (f) => ({ f, items: await listChildren(token, f.id) })));
    for (const { f, items } of results) {
      for (const it of items) {
        const path = `${f.prefix}${it.name}`;
        if (it.mimeType === FOLDER_MIME) {
          if (!it.name.startsWith(".")) queue.push({ id: it.id, prefix: `${path}/` });
        } else if (isNotePath(path)) {
          notes.push({ id: it.id, path, modifiedTime: it.modifiedTime });
        }
      }
    }
  }
  return notes;
}

export function getItem(token: string, id: string) {
  return call<{ id: string; name: string; mimeType: string; trashed?: boolean; parents?: string[]; modifiedTime?: string }>(
    token,
    `${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,parents,modifiedTime`,
  );
}

/** 노트 내용 (텍스트) */
export async function downloadText(token: string, id: string): Promise<string> {
  const res = await fetch(`${API}/files/${encodeURIComponent(id)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new GoogleApiError(res.status, `노트를 받지 못했습니다 (${res.status})`);
  return res.text();
}

export function createFolder(token: string, name: string, parent: string) {
  return call<{ id: string }>(token, `${API}/files?fields=id`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
}

function multipart(meta: Record<string, unknown>, content: string) {
  const boundary = `erp${Math.random().toString(36).slice(2)}`;
  const body =
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\ncontent-type: text/markdown; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  return { body, headers: { "content-type": `multipart/related; boundary=${boundary}` } };
}

export type Uploaded = { id: string; modifiedTime: string; trashed?: boolean };

/** .md 파일 만들기 */
export function createTextFile(token: string, parent: string, name: string, content: string): Promise<Uploaded> {
  const m = multipart({ name, parents: [parent], mimeType: "text/markdown" }, content);
  return call<Uploaded>(token, `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, { method: "POST", ...m });
}

/** .md 파일 내용(과 이름) 바꾸기. 휴지통에 있는 파일도 바뀌므로 trashed 를 같이 받는다 */
export function updateTextFile(token: string, id: string, name: string, content: string): Promise<Uploaded> {
  const m = multipart({ name }, content);
  return call<Uploaded>(token, `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=multipart&fields=id,modifiedTime,trashed`, { method: "PATCH", ...m });
}

/** 폴더가 아직 쓸 수 있는지 (지웠거나 권한이 없으면 false) */
export async function folderAlive(token: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  try {
    const f = await getItem(token, id);
    return f.mimeType === FOLDER_MIME && !f.trashed;
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 404 || e.status === 403)) return false;
    throw e;
  }
}

/** 동시에 몇 개씩만 실행 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** 휴지통으로 (드라이브에서 30일 안에 되살릴 수 있다). 이미 없으면 그냥 넘어간다 */
/**
 * 휴지통으로 옮기기. 404 는 그대로 던진다: drive.file 권한에서는 ERP가 만들지 않은 파일도 404 라서
 * '이미 없음'과 '고칠 권한 없음'을 부르는 쪽이 구분해야 한다.
 */
export async function trashFile(token: string, id: string): Promise<void> {
  await call(token, `${API}/files/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

/** 파일이 드라이브에 살아 있으면 그 정보 (읽기 권한으로 본다). 지웠거나 휴지통이면 null */
export async function liveFile(token: string, id: string) {
  try {
    const f = await getItem(token, id);
    return f.trashed ? null : f;
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 404) return null;
    throw e;
  }
}
