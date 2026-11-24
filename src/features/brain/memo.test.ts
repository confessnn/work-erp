import { describe, expect, it } from "vitest";
import { editMemo, isErpMemo, memoBody, memoNote, memoTitle, seoulStamp, telegramMemoText } from "./memo";

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

describe("isErpMemo / editMemo / memoBody", () => {
  const made = memoNote("첫 생각\n둘째 줄", now)!.content;
  it("ERP 메모만 고칠 수 있다", () => {
    expect(isErpMemo(made)).toBe(true);
    expect(isErpMemo("---\nsource: work-erp\ntype: todos\n---\n")).toBe(false);
    expect(isErpMemo("# 옵시디언에서 쓴 노트")).toBe(false);
  });
  it("본문만 바꾸고 updated 를 적는다 (두 번 고쳐도 하나)", () => {
    const later = new Date("2026-11-25T01:00:00Z"); // 서울 10:00
    const once = editMemo(made, "고친 생각 #아이디어", later)!;
    const twice = editMemo(once, "또 고침", later)!;
    expect(once).toBe(
      "---\nsource: work-erp\ntype: memo\ncreated: 2026-11-24 14:05\nupdated: 2026-11-25 10:00\ntags:\n  - erp/메모\n---\n고친 생각 #아이디어\n",
    );
    expect(twice.match(/updated:/g)).toHaveLength(1);
    expect(memoBody(twice)).toBe("또 고침");
    expect(isErpMemo(twice)).toBe(true);
  });
  it("빈 본문은 null", () => {
    expect(editMemo(made, "  ", now)).toBeNull();
  });
});

describe("telegramMemoText", () => {
  it("메모로 시작하는 글만", () => {
    expect(telegramMemoText("메모 강의 자료에 사례 추가")).toBe("강의 자료에 사례 추가");
    expect(telegramMemoText("메모: 첫 줄\n둘째 줄")).toBe("첫 줄\n둘째 줄");
    expect(telegramMemoText("메모\n여러 줄")).toBe("여러 줄");
    expect(telegramMemoText("/memo idea")).toBe("idea");
    expect(telegramMemoText("/memo@work_erp_bot idea")).toBe("idea");
    expect(telegramMemoText("메모")).toBeNull();
    expect(telegramMemoText("메모장 사기")).toBeNull();
    expect(telegramMemoText("내일 도고 켐코 녹음준비 메모")).toBeNull();
  });
});
