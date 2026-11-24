import { describe, expect, it } from "vitest";
import type { Series } from "@/features/records/series";
import { digest, planExport, safeFileName, seriesNote, uniqueNames } from "./export";
import { buildBrainGraph, forceLayout } from "./graph";
import { planSync, syncSummary } from "./sync";

describe("buildBrainGraph", () => {
  const notes = [
    { id: "1", path: "A.md", title: "A", section: "other" as const, links: ["b", "b", "c"] },
    { id: "2", path: "B.md", title: "B", section: "other" as const, links: ["a"] },
    { id: "3", path: "C.md", title: "C", section: "other" as const, links: [] },
    { id: "4", path: "D.md", title: "D", section: "other" as const, links: ["없음"] },
  ];
  it("같은 두 노트 사이 선은 하나, 링크 없는 노트는 따로 센다", () => {
    const g = buildBrainGraph(notes);
    expect(g.edges).toEqual([
      { from: "1", to: "2" },
      { from: "1", to: "3" },
    ]);
    expect(g.nodes.map((n) => [n.id, n.degree])).toEqual([
      ["1", 2],
      ["2", 1],
      ["3", 1],
    ]);
    expect(g.alone).toBe(1);
  });
  it("배치는 그림 안에, 같은 입력이면 같은 결과", () => {
    const g = buildBrainGraph(notes);
    const a = forceLayout(g.nodes, g.edges, 600);
    expect(a).toEqual(forceLayout(g.nodes, g.edges, 600));
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(600);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(600);
    }
  });
});

const series: Series = {
  key: "재경관리사",
  name: "재경관리사",
  entries: [
    { kind: "lecture", id: "b", title: "재경관리사 2회차", organization: "서울시청", date: "2026-11-20", start_time: "09:00:00", record: "원가 단원 진도" },
    { kind: "lecture", id: "a", title: "재경관리사", organization: "서울시청", date: "2026-11-13", start_time: null, record: "OT" },
  ],
};

describe("export", () => {
  it("파일 이름에 못 쓰는 글자를 뺀다", () => {
    expect(safeFileName('원가/계산: "A"#1 [초안]')).toBe("원가 계산 A 1 초안");
    expect(safeFileName("...")).toBe("이름 없음");
  });
  it("겹치는 이름에 번호", () => {
    expect(uniqueNames(["a", "A", "b", "a"])).toEqual(["a", "A (2)", "b", "a (3)"]);
  });
  it("노트 내용: 기관 링크, 회차별 기록, 금액 없음", () => {
    const md = seriesNote(series);
    expect(md).toContain("- 기관: [[서울시청]]");
    expect(md).toContain("## 2026-11-20 · 09:00 · 재경관리사 2회차\n\n원가 단원 진도");
    expect(md).toContain("first: 2026-11-13");
    expect(md).not.toMatch(/원$|강의료/m);
  });
  it("지문은 내용이 바뀌면 바뀐다", () => {
    expect(digest("a")).toBe(digest("a"));
    expect(digest("a")).not.toBe(digest("b"));
    expect(planExport([series])[0].fileName).toBe("재경관리사.md");
  });
});

describe("planSync", () => {
  const remote = [
    { id: "1", path: "a.md", modifiedTime: "2026-11-24T00:00:00.000Z" },
    { id: "2", path: "new/b.md", modifiedTime: "2026-11-01T00:00:00.000Z" },
    { id: "3", path: "c.md", modifiedTime: "2026-11-02T00:00:00.000Z" },
  ];
  const local = [
    { drive_file_id: "1", path: "a.md", modified_at: "2026-11-01T00:00:00+00:00" },
    { drive_file_id: "2", path: "b.md", modified_at: "2026-11-01T00:00:00+00:00" },
    { drive_file_id: "9", path: "gone.md", modified_at: "2026-11-01T00:00:00+00:00" },
  ];
  it("바뀐 것·새 것은 받고, 옮긴 것은 경로만, 없어진 것은 지운다", () => {
    const p = planSync(remote, local);
    expect(p.download.map((r) => r.id)).toEqual(["1", "3"]);
    expect(p.moved.map((r) => r.id)).toEqual(["2"]);
    expect(p.remove).toEqual(["9"]);
    expect(p.remaining).toBe(0);
  });
  it("한 번에 받는 수 제한", () => {
    expect(planSync(remote, [], 1)).toMatchObject({ remaining: 2 });
  });
  it("요약", () => {
    expect(syncSummary({ total: 3, downloaded: 0, removed: 0, remaining: 0 })).toBe("노트 3개 · 바뀐 것 없음");
  });
});

describe("buildBrainGraph 의 흐린 점", () => {
  it("없는 노트를 두 노트 이상이 가리키면 흐린 점으로 잇는다", () => {
    const g = buildBrainGraph([
      { id: "1", path: "A.md", title: "A", section: "other", links: ["서울시청", "혼자"] },
      { id: "2", path: "B.md", title: "B", section: "other", links: ["서울시청"] },
    ]);
    expect(g.nodes.find((n) => n.ghost)).toMatchObject({ id: "ghost:서울시청", title: "서울시청", degree: 2 });
    expect(g.nodes.some((n) => n.title === "혼자")).toBe(false);
    expect(g.alone).toBe(0);
    expect(g.truncated).toBe(false);
  });
});
