import "server-only";
import { GoogleApiError } from "@/features/google-calendar/google-api";

/** 서버에서 쓰는 구글 드라이브 API (drive.file 권한: 이 앱이 만든 파일만) */
const API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleApiError(res.status, json?.error?.message ?? `드라이브 오류 ${res.status}`);
  return json as T;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
};

export function getFile(token: string, id: string) {
  return call<DriveFile>(token, "GET", `/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size,parents,trashed,webViewLink`);
}

async function folderUsable(token: string, id: string | null) {
  if (!id) return false;
  try {
    const f = await getFile(token, id);
    return f.mimeType === FOLDER && !f.trashed;
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 404 || e.status === 403)) return false;
    throw e;
  }
}

function createFolder(token: string, name: string, parent?: string) {
  return call<DriveFile>(token, "POST", "/files?fields=id", {
    name,
    mimeType: FOLDER,
    ...(parent ? { parents: [parent] } : {}),
  });
}

/** work-erp / 서류함, work-erp / 제출용 압축파일 폴더를 확인하고 없으면 만든다 */
export async function ensureFolders(
  token: string,
  current: { docs: string | null; bundles: string | null },
): Promise<{ docs: string; bundles: string; changed: boolean }> {
  const [docsOk, bundlesOk] = await Promise.all([folderUsable(token, current.docs), folderUsable(token, current.bundles)]);
  if (docsOk && bundlesOk) return { docs: current.docs!, bundles: current.bundles!, changed: false };

  // 둘 중 하나라도 없으면 상위 폴더 확인 (남아 있는 폴더의 부모를 재사용)
  let root: string | undefined;
  const alive = docsOk ? current.docs : bundlesOk ? current.bundles : null;
  if (alive) root = (await getFile(token, alive)).parents?.[0];
  if (!root) root = (await createFolder(token, "work-erp")).id;

  const docs = docsOk ? current.docs! : (await createFolder(token, "서류함", root)).id;
  const bundles = bundlesOk ? current.bundles! : (await createFolder(token, "제출용 압축파일", root)).id;
  return { docs, bundles, changed: true };
}

export async function trashFile(token: string, id: string) {
  try {
    await call(token, "PATCH", `/files/${encodeURIComponent(id)}`, { trashed: true });
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 404) return; // 이미 없음
    throw e;
  }
}

/** 링크가 있는 사람 누구나 보기 → 공유 링크 반환 */
export async function shareWithLink(token: string, id: string) {
  await call(token, "POST", `/files/${encodeURIComponent(id)}/permissions`, { role: "reader", type: "anyone" });
  const f = await getFile(token, id);
  return f.webViewLink ?? `https://drive.google.com/file/d/${id}/view`;
}

export async function stopSharing(token: string, id: string) {
  try {
    await call(token, "DELETE", `/files/${encodeURIComponent(id)}/permissions/anyoneWithLink`);
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 404) return; // 이미 공유 안 됨 / 파일 없음
    throw e;
  }
}
