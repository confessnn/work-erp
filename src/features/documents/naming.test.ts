import { describe, expect, it } from "vitest";
import { bundleFileNames, extOf, isStale, safeName, zipName } from "./naming";

const doc = (doc_type: string, file_name: string, title: string | null = null, mime_type: string | null = null) =>
  ({ doc_type, title, file_name, mime_type }) as Parameters<typeof bundleFileNames>[0][number];

describe("bundleFileNames", () => {
  it("이름_서류종류.확장자", () => {
    expect(bundleFileNames([doc("resume", "내 이력서 최종.pdf"), doc("employment", "scan001.JPG")], "임승택")).toEqual([
      "임승택_이력서.pdf",
      "임승택_재직증명서.jpg",
    ]);
  });

  it("제목이 있으면 붙이고, 같은 이름은 번호", () => {
    expect(
      bundleFileNames(
        [doc("certificate", "a.pdf", "정보처리기사"), doc("certificate", "b.pdf", "원가분석사"), doc("certificate", "c.pdf"), doc("certificate", "d.pdf")],
        "임승택",
      ),
    ).toEqual(["임승택_자격증_정보처리기사.pdf", "임승택_자격증_원가분석사.pdf", "임승택_자격증.pdf", "임승택_자격증_2.pdf"]);
  });

  it("이름이 비어 있어도 동작", () => {
    expect(bundleFileNames([doc("id_card", "x.png")], "")).toEqual(["신분증사본.png"]);
  });
});

describe("zipName", () => {
  it("이름_기관_제출서류_날짜.zip", () => {
    expect(zipName("임승택", "OO대학교", "2026-11-05")).toBe("임승택_OO대학교_제출서류_20261105.zip");
    expect(zipName("임승택", null, "2026-11-05")).toBe("임승택_제출서류_20261105.zip");
  });
  it("파일 이름에 못 쓰는 문자 제거", () => {
    expect(zipName("임승택", 'A/B:C*대학"교', "2026-11-05")).toBe("임승택_ABC대학교_제출서류_20261105.zip");
    expect(safeName("  a   b  ")).toBe("a b");
  });
});

describe("extOf", () => {
  it("파일명 확장자 우선, 없으면 MIME", () => {
    expect(extOf("x.HWP")).toBe("hwp");
    expect(extOf("스캔", "image/png")).toBe("png");
    expect(extOf("스캔")).toBe("pdf");
  });
});

describe("isStale", () => {
  it("재직·경력증명서는 90일 지나면 오래됨", () => {
    expect(isStale({ doc_type: "employment", issued_on: "2026-08-01" }, "2026-11-05")).toBe(true);
    expect(isStale({ doc_type: "employment", issued_on: "2026-09-01" }, "2026-11-05")).toBe(false);
    expect(isStale({ doc_type: "resume", issued_on: "2020-01-01" }, "2026-11-05")).toBe(false);
    expect(isStale({ doc_type: "career", issued_on: null }, "2026-11-05")).toBe(false);
  });
});
