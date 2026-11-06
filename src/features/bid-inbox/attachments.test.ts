import { describe, expect, it } from "vitest";
import { listFiles, pickDocs } from "./attachments";

const file = (name: string) => ({ name, url: `https://www.g2b.go.kr/${name}` });

describe("listFiles", () => {
  it("일반 첨부와 e발주 첨부를 모은다", () => {
    const files = listFiles(
      { ntceSpecFileNm1: "공고문.pdf", ntceSpecDocUrl1: "https://a/1", ntceSpecDocUrl2: "https://a/2", ntceSpecFileNm3: "주소 없음.pdf" },
      [{ eorderDocDivNm: "제안요청서", eorderAtchFileNm: "", eorderAtchFileUrl: "https://b/1" }],
    );
    expect(files).toEqual([
      { name: "공고문.pdf", url: "https://a/1" },
      { name: "첨부 2", url: "https://a/2" },
      { name: "제안요청서", url: "https://b/1" },
    ]);
  });
  it("공고 행이 없어도 동작한다", () => {
    expect(listFiles(undefined, [])).toEqual([]);
  });
});

describe("pickDocs", () => {
  const names = (list: string[]) => pickDocs(list.map(file)).map((f) => f.name);

  it("같은 이름이면 PDF를 쓴다", () => {
    expect(names(["공고문.hwpx", "공고문.pdf"])).toEqual(["공고문.pdf"]);
    expect(names(["공고문.pdf", "공고문.hwpx"])).toEqual(["공고문.pdf"]);
  });
  it("공고문·과업 문서만 고르고 안내·서식은 뺀다", () => {
    expect(names(["2.입찰공고문.pdf", "3.제안요청서.pdf", "4.용역계약특수조건.hwp", "5.상생결제시스템 도입 안내.hwp", "(붙임2) 과업지시서.hwpx"])).toEqual([
      "2.입찰공고문.pdf",
      "3.제안요청서.pdf",
      "(붙임2) 과업지시서.hwpx",
    ]);
  });
  it("맞는 이름이 없으면 안내·서식이 아닌 파일을 쓴다", () => {
    expect(names(["용역 내용.pdf", "제출 서식.hwp"])).toEqual(["용역 내용.pdf"]);
    expect(names(["제출 서식.hwp"])).toEqual([]);
  });
  it("최대 4개만 읽는다", () => {
    expect(names(["공고1.pdf", "공고2.pdf", "공고3.pdf", "공고4.pdf", "공고5.pdf"])).toHaveLength(4);
  });
});
