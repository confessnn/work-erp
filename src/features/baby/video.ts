/** 아기 동영상용 순수 함수 (브라우저·서버 공통) */

export const isVideoName = (name: string) => /\.(mp4|mov|m4v|3gp|webm)$/i.test(name);
export const isVideo = (mime: string | null | undefined, name = "") => (mime ?? "").startsWith("video/") || isVideoName(name);

const MAC_EPOCH = Date.UTC(1904, 0, 1); // MP4/MOV 시각의 기준 (1904-01-01 UTC)

/**
 * MP4·MOV 의 'mvhd' 상자에서 촬영(생성) 시각을 꺼낸다. UTC 기준으로 저장돼 있다.
 * 파일 앞부분이나 뒷부분 일부만 넘겨도 된다 (상자 위치는 기기마다 다름). 못 찾거나 이상한 값이면 null.
 */
export function mp4CreationTime(bytes: Uint8Array): Date | null {
  for (let i = 4; i + 24 <= bytes.length; i++) {
    // 'm' 'v' 'h' 'd'
    if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset + i + 4);
    const version = view.getUint8(0);
    const secs = version === 1 ? Number(view.getBigUint64(4)) : view.getUint32(4);
    if (!secs) continue;
    const t = new Date(MAC_EPOCH + secs * 1000);
    if (t.getUTCFullYear() > 2000 && t.getTime() < Date.now() + 86_400_000) return t;
  }
  return null;
}

/** 원본 보기 한 번에 보내는 최대 크기 (서버 응답 4.5MB 제한 아래). 동영상은 이 크기씩 나눠 받는다 */
export const STREAM_CHUNK = 4 * 1024 * 1024;

/**
 * 브라우저가 보낸 Range("bytes=100-", "bytes=0-1") → 드라이브에 요청할 범위 (최대 STREAM_CHUNK).
 * 없거나 이상하면 처음부터.
 */
export function clampRange(header: string | null, chunk = STREAM_CHUNK): { start: number; end: number } {
  const m = /^bytes=(\d+)-(\d*)$/.exec((header ?? "").trim());
  const start = m ? Number(m[1]) : 0;
  const want = m && m[2] ? Number(m[2]) : Infinity;
  return { start, end: Math.max(start, Math.min(want, start + chunk - 1)) };
}
