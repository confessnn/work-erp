"use client";

/**
 * 브라우저 ↔ 구글 드라이브 직접 전송 (서버 용량 제한을 피하기 위해).
 * 토큰은 getDriveSession() 이 주는 1시간짜리 '앱이 만든 파일만' 권한 토큰.
 */

async function driveError(res: Response) {
  const j = await res.json().catch(() => null);
  const msg = j?.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 401) return new Error("구글 인증이 만료됐습니다. 다시 시도해주세요.");
  if (res.status === 404) return new Error("드라이브에서 파일을 찾지 못했습니다. 드라이브에서 지워졌을 수 있습니다.");
  return new Error(`드라이브 오류: ${msg}`);
}

/** 재개 가능 업로드(resumable): 5MB 넘는 파일도 한 번에 */
export async function uploadToDrive(
  token: string,
  folderId: string,
  file: Blob,
  name: string,
  mimeType = file.type || "application/octet-stream",
): Promise<string> {
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": mimeType,
      "x-upload-content-length": String(file.size),
    },
    body: JSON.stringify({ name, parents: [folderId], mimeType }),
  });
  if (!start.ok) throw await driveError(start);
  const location = start.headers.get("location");
  if (!location) throw new Error("드라이브 업로드 주소를 받지 못했습니다.");

  const put = await fetch(location, { method: "PUT", headers: { "content-type": mimeType }, body: file });
  if (!put.ok) throw await driveError(put);
  const json = (await put.json()) as { id: string };
  return json.id;
}

export async function downloadFromDrive(token: string, fileId: string): Promise<Uint8Array> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await driveError(res);
  return new Uint8Array(await res.arrayBuffer());
}

/** Blob 을 파일로 저장 (PC: 다운로드 폴더 / 아이폰: '파일' 앱으로) */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
