import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("굵게·링크·태그·코드", () => {
    expect(parseInline("**굵게** 와 [[노트|별칭]] #태그 `코드`")).toEqual([
      { t: "bold", c: [{ t: "text", v: "굵게" }] },
      { t: "text", v: " 와 " },
      { t: "wiki", target: "노트", label: "별칭", embed: false },
      { t: "text", v: " " },
      { t: "tag", v: "태그" },
      { t: "text", v: " " },
      { t: "code", v: "코드" },
    ]);
  });
  it("위험한 주소는 링크로 만들지 않는다", () => {
    expect(parseInline("[눌러](javascript:alert(1))")).toEqual([{ t: "text", v: "[눌러](javascript:alert(1))" }]);
    expect(parseInline("[사이트](https://a.com)")).toEqual([{ t: "link", href: "https://a.com", label: "사이트" }]);
  });
  it("글자 속 # 과 숫자 태그는 태그가 아니다", () => {
    expect(parseInline("C#언어 #2026")).toEqual([{ t: "text", v: "C#언어 #2026" }]);
  });
  it("맨 주소는 링크", () => {
    expect(parseInline("보기 https://a.com/b.")).toEqual([
      { t: "text", v: "보기 " },
      { t: "link", href: "https://a.com/b", label: "https://a.com/b" },
      { t: "text", v: "." },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("제목·목록·체크박스·코드·콜아웃·표", () => {
    const md = [
      "# 제목",
      "",
      "- [ ] 할 일",
      "  - [x] 끝",
      "1. 하나",
      "",
      "```ts",
      "const a = 1;",
      "```",
      "> [!tip] 팁",
      "> 내용",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "---",
      "문단",
    ].join("\n");
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.t)).toEqual(["heading", "list", "list", "code", "quote", "table", "hr", "para"]);
    expect(blocks[1]).toEqual({
      t: "list",
      ordered: false,
      items: [
        { indent: 0, checked: false, c: [{ t: "text", v: "할 일" }] },
        { indent: 1, checked: true, c: [{ t: "text", v: "끝" }] },
      ],
    });
    expect(blocks[3]).toEqual({ t: "code", lang: "ts", v: "const a = 1;" });
    expect(blocks[4]).toMatchObject({ t: "quote", callout: "tip", lines: [[{ t: "text", v: "내용" }]] });
    expect(blocks[5]).toMatchObject({ t: "table", rows: [[[{ v: "a" }], [{ v: "b" }]], [[{ v: "1" }], [{ v: "2" }]]] });
  });
});
