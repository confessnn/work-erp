import { deflateRawSync } from "node:zlib";
import CFB from "cfb";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docKind, hwpText, hwpxText } from "./doc-text";

/** HWP 레코드: 머리글(태그·크기) + 내용 */
function record(tag: number, body: Buffer) {
  const head = Buffer.alloc(4);
  head.writeUInt32LE((tag | (body.length << 20)) >>> 0);
  return Buffer.concat([head, body]);
}

function makeHwp(paragraphs: Buffer[], compressed = true) {
  const doc = CFB.utils.cfb_new();
  const header = Buffer.alloc(256);
  header[36] = compressed ? 1 : 0;
  CFB.utils.cfb_add(doc, "/FileHeader", header);
  const body = Buffer.concat(paragraphs.map((p) => record(67, p)));
  CFB.utils.cfb_add(doc, "/BodyText/Section0", compressed ? deflateRawSync(body) : body);
  return new Uint8Array(CFB.write(doc, { type: "buffer" }) as Buffer);
}

describe("hwpText", () => {
  it("압축된 본문의 문단을 읽는다", () => {
    expect(hwpText(makeHwp([Buffer.from("입찰 공고", "utf16le"), Buffer.from("과업 범위", "utf16le")]))).toBe("입찰 공고\n과업 범위");
  });
  it("압축하지 않은 본문도 읽는다", () => {
    expect(hwpText(makeHwp([Buffer.from("입찰 공고", "utf16le")], false))).toBe("입찰 공고");
  });
  it("8칸짜리 제어 문자를 건너뛴다", () => {
    const control = Buffer.alloc(16);
    control.writeUInt16LE(11, 0); // 표 같은 개체 자리
    control.write("쓰레기", 2, "utf16le");
    expect(hwpText(makeHwp([Buffer.concat([Buffer.from("앞", "utf16le"), control, Buffer.from("뒤", "utf16le")])]))).toBe("앞뒤");
  });
  it("본문이 없으면 빈 문자열", () => {
    expect(hwpText(makeHwp([]))).toBe("");
  });
});

describe("hwpxText", () => {
  it("구역 순서대로 문단을 읽고 특수문자를 푼다", () => {
    const section = (t: string) => strToU8(`<hs:sec><hp:p><hp:run><hp:t>${t}</hp:t></hp:run><hp:run><hp:t a="1">입니다</hp:t></hp:run></hp:p><hp:p><hp:t></hp:t></hp:p></hs:sec>`);
    const zip = zipSync({
      "Contents/section10.xml": section("셋째"),
      "Contents/section2.xml": section("둘째 &amp; 그다음"),
      "Contents/header.xml": section("머리"),
    });
    expect(hwpxText(zip)).toBe("둘째 & 그다음입니다\n셋째입니다");
  });
});

describe("docKind", () => {
  it("앞머리로 형식을 구분한다", () => {
    expect(docKind(strToU8("%PDF-1.6"))).toBe("pdf");
    expect(docKind(zipSync({ a: strToU8("b") }))).toBe("hwpx");
    expect(docKind(makeHwp([]))).toBe("hwp");
    expect(docKind(strToU8("<html>"))).toBe("unknown");
  });
});
