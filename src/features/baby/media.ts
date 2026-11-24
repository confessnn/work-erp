/**
 * 아기 사진·동영상으로 받는 파일 종류 (브라우저·서버 공통).
 * 이 목록 밖의 종류(HTML·SVG 등)는 올리지도, 원본 보기로 보내지도 않는다.
 * 원본 보기는 ERP 주소에서 열리므로, 스크립트가 들어갈 수 있는 종류를 보내면 로그인 권한으로 실행될 수 있다.
 */
export const MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
  "video/x-m4v",
]);

const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  m4v: "video/x-m4v",
};

/** 허용된 종류면 그 값(소문자, 매개변수 제거), 아니면 null */
export function allowedMediaType(mime: string | null | undefined): string | null {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return MEDIA_TYPES.has(m) ? m : null;
}

/** 브라우저가 알려준 종류가 없거나 비어 있으면 확장자로 정한다. 둘 다 안 되면 null */
export function uploadMediaType(mime: string | null | undefined, name: string): string | null {
  const direct = allowedMediaType(mime);
  if (direct) return direct;
  if (mime && mime !== "application/octet-stream") return null; // 다른 종류라고 밝힌 파일은 받지 않음
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? null;
}
