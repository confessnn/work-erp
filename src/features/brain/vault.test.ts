import { describe, expect, it } from "vitest";
import {
  backlinksOf,
  extractLinks,
  extractTags,
  isNotePath,
  linkResolver,
  parseFolderId,
  parseNote,
  sectionOf,
  snippet,
  splitFrontmatter,
} from "./vault";

describe("sectionOf", () => {
  it("맨 위 폴더 이름으로 PARA 를 가린다", () => {
    expect(sectionOf("1 Projects/원가/착수.md")).toBe("projects");
    expect(sectionOf("01_Projects/a.md")).toBe("projects");
    expect(sectionOf("2. 영역/건강.md")).toBe("areas");
    expect(sectionOf("Resources/세법.md")).toBe("resources");
    expect(sectionOf("4 Archives/2025/끝.md")).toBe("archives");
    expect(sectionOf("0 Inbox/메모.md")).toBe("inbox");
    expect(sectionOf("ERP 기록/재경관리사.md")).toBe("other");
    expect(sectionOf("맨위노트.md")).toBe("other");
  });
});

describe("isNotePath", () => {
  it("숨김 폴더와 .md 가 아닌 파일은 뺀다", () => {
    expect(isNotePath("a/b.md")).toBe(true);
    expect(isNotePath(".obsidian/workspace.md")).toBe(false);
    expect(isNotePath("a/.trash/x.md")).toBe(false);
    expect(isNotePath("a/그림.png")).toBe(false);
  });
});

describe("splitFrontmatter", () => {
  it("목록·대괄호·한 줄 값을 읽는다", () => {
    const { meta, body } = splitFrontmatter('---\ntitle: "제목"\ntags:\n  - 원가\n  - 입찰\naliases: [a, b]\n---\n본문');
    expect(meta).toEqual({ title: "제목", tags: ["원가", "입찰"], aliases: ["a", "b"] });
    expect(body).toBe("본문");
  });
  it("frontmatter 가 없으면 그대로", () => {
    expect(splitFrontmatter("# 제목").body).toBe("# 제목");
  });
});

describe("extractLinks / extractTags", () => {
  it("링크의 #제목·|별칭을 떼고, 첨부·코드 안 링크는 뺀다", () => {
    const body = "[[원가계산#방법|방법]] 그리고 [[폴더/노트]] ![[그림.png]] `[[코드]]`\n```\n[[블록]]\n```\n[[원가계산]]";
    expect(extractLinks(body)).toEqual(["원가계산", "폴더/노트"]);
  });
  it("태그: 본문 #태그 + frontmatter, 제목·숫자는 아님", () => {
    expect(extractTags("# 제목\n내용 #원가 #2026 #입찰/나라장터", { tags: ["강의"] })).toEqual(["강의", "원가", "입찰/나라장터"]);
  });
});

describe("parseNote", () => {
  it("제목·구분·링크·태그", () => {
    expect(parseNote("1 Projects/착수.md", "---\ntags: [a]\n---\n[[B]] #c")).toEqual({
      path: "1 Projects/착수.md",
      title: "착수",
      section: "projects",
      links: ["b"],
      tags: ["a", "c"],
    });
  });
});

describe("linkResolver / backlinksOf", () => {
  const notes = [
    { path: "A.md", links: ["b"] },
    { path: "x/B.md", links: [] as string[] },
    { path: "y/z/B.md", links: ["a"] },
    { path: "C.md", links: ["x/b", "없는노트"] },
  ];
  it("이름만으로 찾을 땐 경로가 짧은 노트, 경로로도 찾는다", () => {
    const r = linkResolver(notes);
    expect(r("b")?.path).toBe("x/B.md");
    expect(r("y/z/b")?.path).toBe("y/z/B.md");
    expect(r("없는노트")).toBeUndefined();
  });
  it("백링크", () => {
    expect(backlinksOf(notes[1], notes).map((n) => n.path)).toEqual(["A.md", "C.md"]);
    expect(backlinksOf(notes[0], notes).map((n) => n.path)).toEqual(["y/z/B.md"]);
  });
});

describe("parseFolderId", () => {
  it("폴더 링크·ID", () => {
    expect(parseFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjK_lm-no?usp=sharing")).toBe("1AbCdEfGhIjK_lm-no");
    expect(parseFolderId("https://drive.google.com/open?id=1AbCdEfGhIjK")).toBe("1AbCdEfGhIjK");
    expect(parseFolderId("1AbCdEfGhIjK")).toBe("1AbCdEfGhIjK");
    expect(parseFolderId("내 볼트")).toBeNull();
  });
});

describe("snippet", () => {
  it("찾은 글자 주변만", () => {
    const text = `${"가".repeat(100)}원가계산${"나".repeat(100)}`;
    const s = snippet(text, "원가", 5);
    expect(s).toBe("…가가가가가원가계산나나나…");
  });
});
