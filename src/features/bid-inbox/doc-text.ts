import { inflateRawSync } from "node:zlib";
import CFB from "cfb";
import { strFromU8, unzipSync } from "fflate";

export type DocKind = "pdf" | "hwpx" | "hwp" | "unknown";

/** 파일 앞머리로 형식을 판단한다 (첨부 이름이 비어 있는 경우가 있어 확장자를 믿지 않는다) */
export function docKind(bytes: Uint8Array): DocKind {
  const head = Buffer.from(bytes.subarray(0, 4)).toString("hex");
  if (head === "25504446") return "pdf";
  if (head === "504b0304") return "hwpx";
  if (head === "d0cf11e0") return "hwp";
  return "unknown";
}

const decodeXml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

/** HWPX(압축된 XML)의 본문 글자 */
export function hwpxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => /^Contents\/section\d+\.xml$/i.test(f.name) });
  const paragraphs: string[] = [];
  for (const name of Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    for (const para of strFromU8(files[name]).split(/<\/hp:p>/)) {
      const line = [...para.matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)]
        .map((m) => decodeXml(m[1].replace(/<[^>]+>/g, " ")))
        .join("");
      if (line.trim()) paragraphs.push(line.trim());
    }
  }
  return paragraphs.join("\n");
}

const HWPTAG_PARA_TEXT = 67;

/** 문단 글자 레코드 → 글자. 코드 1~23은 10·13을 빼면 8칸짜리 제어 문자라 건너뛴다 */
function paraText(data: Buffer) {
  let out = "";
  for (let i = 0; i + 1 < data.length; ) {
    const code = data.readUInt16LE(i);
    if (code >= 1 && code <= 23 && code !== 10 && code !== 13) {
      i += 16;
      continue;
    }
    i += 2;
    if (code >= 32) out += String.fromCharCode(code);
  }
  return out;
}

/** 구형 HWP 본문 글자. 배포용 문서(본문 암호화)는 빈 문자열이 된다 */
export function hwpText(bytes: Uint8Array): string {
  const doc = CFB.read(Buffer.from(bytes), { type: "buffer" });
  const header = CFB.find(doc, "/FileHeader")?.content;
  const compressed = header ? (Buffer.from(header as Uint8Array)[36] & 1) === 1 : true;

  const paragraphs: string[] = [];
  for (let n = 0; ; n++) {
    const section = CFB.find(doc, `/BodyText/Section${n}`)?.content;
    if (!section) break;
    const raw = Buffer.from(section as Uint8Array);
    const data = compressed ? inflateRawSync(raw) : raw;
    for (let i = 0; i + 4 <= data.length; ) {
      const head = data.readUInt32LE(i);
      i += 4;
      const tag = head & 0x3ff;
      let size = head >>> 20;
      if (size === 0xfff) {
        size = data.readUInt32LE(i);
        i += 4;
      }
      if (tag === HWPTAG_PARA_TEXT) {
        const line = paraText(data.subarray(i, i + size)).trim();
        if (line) paragraphs.push(line);
      }
      i += size;
    }
  }
  return paragraphs.join("\n");
}
