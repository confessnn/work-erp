import { describe, expect, it } from "vitest";
import { allowedMediaType, uploadMediaType } from "./media";

describe("allowedMediaType", () => {
  it("사진·동영상 종류는 통과", () => {
    expect(allowedMediaType("image/jpeg")).toBe("image/jpeg");
    expect(allowedMediaType("Video/QuickTime")).toBe("video/quicktime");
    expect(allowedMediaType("image/heic; charset=binary")).toBe("image/heic");
  });

  it("스크립트가 들어갈 수 있는 종류는 거름", () => {
    for (const m of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/pdf", "", null, undefined]) {
      expect(allowedMediaType(m)).toBeNull();
    }
  });
});

describe("uploadMediaType", () => {
  it("종류가 비었으면 확장자로", () => {
    expect(uploadMediaType("", "IMG_0001.HEIC")).toBe("image/heic");
    expect(uploadMediaType("application/octet-stream", "clip.mov")).toBe("video/quicktime");
  });

  it("다른 종류라고 밝힌 파일이나 모르는 확장자는 거절", () => {
    expect(uploadMediaType("text/html", "a.jpg")).toBeNull();
    expect(uploadMediaType("", "a.svg")).toBeNull();
    expect(uploadMediaType("", "a.html")).toBeNull();
  });
});
