import { describe, expect, it } from "vitest";
import { memoNote, memoTitle, seoulStamp } from "./memo";

const now = new Date("2026-11-24T05:05:00Z"); // 서울 14:05

describe("seoulStamp", () => {
  it("서울 시각", () => {
    expect(seoulStamp(now)).toEqual({ day: "2026-11-24", time: "14:05", stamp: "2026-11-24 1405" });
    expect(seoulStamp(new Date("2026-11-24T15:30:00Z")).day).toBe("2026-11-25");
  });
});

describe("memoTitle", () => {
  it("적은 제목, 없으면 첫 줄 (표시는 뗀다)", () => {
    expect(memoTitle("본문", "  제목  ")).toBe("제목");
    expect(memoTitle("\n## **원가** 아이디어\n둘째 줄")).toBe("원가 아이디어");
    expect(memoTitle("- [ ] 할 것")).toBe("할 것");
    expect(memoTitle("가".repeat(50))).toBe(`${"가".repeat(40)}…`);
  });
});

describe("memoNote", () => {
  it("파일 이름·frontmatter·본문", () => {
    const m = memoNote("강의 자료에 사례 추가\n- 국방부 사례", now)!;
    expect(m.fileName).toBe("2026-11-24 1405 강의 자료에 사례 추가.md");
    expect(m.content).toBe(
      "---\nsource: work-erp\ntype: memo\ncreated: 2026-11-24 14:05\ntags:\n  - erp/메모\n---\n강의 자료에 사례 추가\n- 국방부 사례\n",
    );
  });
  it("제목을 따로 적으면 제목 줄을 붙이고, 파일 이름에 못 쓰는 글자는 뺀다", () => {
    const m = memoNote("본문", now, "A/B: 비교?")!;
    expect(m.fileName).toBe("2026-11-24 1405 A B 비교.md");
    expect(m.content).toContain("---\n# A/B: 비교?\n\n본문\n");
  });
  it("빈 메모는 null", () => {
    expect(memoNote("   \n ", now)).toBeNull();
  });
});
