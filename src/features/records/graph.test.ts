import { describe, expect, it } from "vitest";
import { circleLayout, connectedNodes, edgeLine, graphInput, parseRelations, type Graph } from "./graph";
import type { Series } from "./series";

const series = (key: string, n: number): Series => ({
  key,
  name: `${key} 이름`,
  entries: Array.from({ length: n }, (_, i) => ({
    kind: "lecture" as const,
    id: `${key}${i}`,
    title: key,
    organization: null,
    date: `2026-11-${String(20 - i).padStart(2, "0")}`,
    start_time: null,
    record: `${key} 기록 ${i}\n둘째 줄`,
  })),
});

describe("graphInput", () => {
  it("일마다 번호를 붙이고 최근 기록만 한 줄로 보낸다", () => {
    const { text, ids } = graphInput([series("a", 10), series("b", 1)]);
    expect([...ids.keys()]).toEqual(["S1", "S2"]);
    expect(text).toContain('<work id="S1" name="a 이름" records="10">');
    expect(text).toContain("- 2026-11-20: a 기록 0 둘째 줄");
    expect(text).not.toContain("a 기록 8");
  });
});

describe("parseRelations", () => {
  const { ids } = graphInput([series("a", 1), series("b", 1), series("c", 1)]);
  it("번호를 일 열쇠로 바꾸고 이상한 것은 버린다", () => {
    const rel = parseRelations(
      {
        relations: [
          { from: "S1", to: "S2", kind: "준비", reason: " 촬영 자료를 강의에 씀 ", evidence: ["2026-11-20", "어제"] },
          { from: "S2", to: "S1", kind: "같은 자료", reason: "x", evidence: [] },
          { from: "S1", to: "S2", kind: "같은 자료", reason: "중복", evidence: [] },
          { from: "S1", to: "S1", kind: "영향", reason: "자기 자신", evidence: [] },
          { from: "S1", to: "S9", kind: "영향", reason: "없는 번호", evidence: [] },
          { from: "S1", to: "S3", kind: "모름", reason: "없는 종류", evidence: [] },
        ],
      },
      ids,
    );
    expect(rel).toEqual([
      { from: "a", to: "b", kind: "준비", reason: "촬영 자료를 강의에 씀", evidence: ["2026-11-20"] },
      { from: "b", to: "a", kind: "같은 자료", reason: "x", evidence: [] },
    ]);
  });
  it("형식이 틀리면 실패", () => {
    expect(() => parseRelations({ nope: 1 }, ids)).toThrow("형식");
  });
});

it("connectedNodes / circleLayout / edgeLine", () => {
  const graph: Graph = {
    nodes: [
      { key: "a", name: "A", count: 4 },
      { key: "b", name: "B", count: 1 },
      { key: "c", name: "C", count: 2 },
    ],
    relations: [{ from: "a", to: "b", kind: "준비", reason: "", evidence: [] }],
  };
  const { connected, alone } = connectedNodes(graph);
  expect(connected.map((n) => n.key)).toEqual(["a", "b"]);
  expect(alone.map((n) => n.key)).toEqual(["c"]);

  const [a, b] = circleLayout(connected, 600);
  expect(a).toMatchObject({ x: 300, y: 84, r: 18 });
  expect(b).toMatchObject({ x: 300, y: 516, r: 13 });
  expect(edgeLine(a, b)).toEqual({ x1: 300, y1: 102, x2: 300, y2: 499 });
  expect(circleLayout([graph.nodes[0]], 600)[0]).toMatchObject({ x: 300, y: 300 });
});
