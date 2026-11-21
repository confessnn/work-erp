import { describe, expect, it } from "vitest";
import { clampRange, isVideo, mp4CreationTime, STREAM_CHUNK } from "./video";

/** 테스트용 mvhd 상자: [크기 4][mvhd][버전 1][플래그 3][생성 시각 4 또는 8]... */
function mvhd(secs: number, version = 0) {
  const len = version === 1 ? 4 + 4 + 4 + 8 + 8 : 4 + 4 + 4 + 4 + 4;
  const buf = new Uint8Array(len + 20);
  const v = new DataView(buf.buffer);
  v.setUint32(10, len);
  buf.set([0x6d, 0x76, 0x68, 0x64], 14);
  v.setUint8(18, version);
  if (version === 1) v.setBigUint64(22, BigInt(secs));
  else v.setUint32(22, secs);
  return buf;
}
const MAC = Date.UTC(1904, 0, 1) / 1000;

describe("mp4CreationTime", () => {
  it("버전 0 시각을 UTC로 읽는다", () => {
    const secs = Date.UTC(2026, 10, 21, 3, 4, 5) / 1000 - MAC;
    expect(mp4CreationTime(mvhd(secs))?.toISOString()).toBe("2026-11-21T03:04:05.000Z");
  });
  it("버전 1 (64비트) 도 읽는다", () => {
    const secs = Date.UTC(2026, 9, 11) / 1000 - MAC;
    expect(mp4CreationTime(mvhd(secs, 1))?.toISOString()).toBe("2026-10-11T00:00:00.000Z");
  });
  it("0이거나 없으면 null", () => {
    expect(mp4CreationTime(mvhd(0))).toBeNull();
    expect(mp4CreationTime(new Uint8Array(100))).toBeNull();
  });
});

describe("clampRange", () => {
  it("Range가 없으면 처음부터 한 조각", () => {
    expect(clampRange(null)).toEqual({ start: 0, end: STREAM_CHUNK - 1 });
  });
  it("끝이 없으면 한 조각까지만", () => {
    expect(clampRange("bytes=100-", 10)).toEqual({ start: 100, end: 109 });
  });
  it("작은 범위는 그대로", () => {
    expect(clampRange("bytes=0-1")).toEqual({ start: 0, end: 1 });
  });
});

describe("isVideo", () => {
  it("형식이나 확장자로 판단", () => {
    expect(isVideo("video/quicktime")).toBe(true);
    expect(isVideo("", "IMG_0001.MOV")).toBe(true);
    expect(isVideo("image/jpeg", "a.jpg")).toBe(false);
  });
});
