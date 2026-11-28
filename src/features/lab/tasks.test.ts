import { describe, expect, it } from "vitest";
import { ROSTER, SEATS, seatPercent } from "./roster";
import { byResearcher, cleanInstruction, firstLine, groupByState, openCount, TITLE_MAX, type LabTask } from "./tasks";

const task = (p: Partial<LabTask>): LabTask => ({
  id: "t1",
  researcher: "chief",
  title: "지시",
  state: "queued",
  result: null,
  started_at: null,
  finished_at: null,
  created_at: "2026-11-28T00:00:00Z",
  updated_at: "2026-11-28T00:00:00Z",
  ...p,
});

describe("연구소 업무 지시", () => {
  it("지시는 앞뒤 공백만 떼고 줄바꿈은 남긴다", () => {
    expect(cleanInstruction("  첫 줄\n둘째 줄  ")).toBe("첫 줄\n둘째 줄");
    expect(cleanInstruction("   ")).toBeNull();
  });

  it("너무 긴 지시는 잘라 낸다 (DB 제한과 같은 길이)", () => {
    expect(cleanInstruction("가".repeat(TITLE_MAX + 50))?.length).toBe(TITLE_MAX);
  });

  it("보드 칸별로 나누고, 칸 안에서는 새 것이 위로", () => {
    const g = groupByState([
      task({ id: "a", state: "queued", created_at: "2026-11-01T00:00:00Z" }),
      task({ id: "b", state: "done" }),
      task({ id: "c", state: "queued", created_at: "2026-11-20T00:00:00Z" }),
    ]);
    expect(g.queued.map((t) => t.id)).toEqual(["c", "a"]);
    expect(g.done.map((t) => t.id)).toEqual(["b"]);
    expect(g.running).toEqual([]);
  });

  it("연구원 앞에 쌓인 일은 완료를 빼고 센다", () => {
    const list = [
      task({ researcher: "cost", state: "queued" }),
      task({ researcher: "cost", state: "running" }),
      task({ researcher: "cost", state: "done" }),
      task({ researcher: "dev", state: "queued" }),
    ];
    expect(openCount(list, "cost")).toBe(2);
    expect(openCount(list, "spare")).toBe(0);
  });

  it("연구원별로 묶는다", () => {
    const m = byResearcher([task({ researcher: "dev" }), task({ researcher: "cost" }), task({ researcher: "dev" })]);
    expect(m.get("dev")?.length).toBe(2);
    expect(m.get("cost")?.length).toBe(1);
  });

  it("카드 제목은 첫 줄만 쓰고 길면 줄인다", () => {
    expect(firstLine("첫 줄\n둘째 줄")).toBe("첫 줄");
    expect(firstLine("가".repeat(80), 10)).toBe(`${"가".repeat(10)}…`);
  });

  it("연구원마다 연구실 그림 안에 앉을 자리가 있다", () => {
    for (const r of ROSTER) expect(SEATS[r.id]).toBeTruthy();
    expect(Object.keys(SEATS).length).toBe(ROSTER.length);
  });

  it("자리는 그림 안 백분율로 환산된다", () => {
    expect(seatPercent("chief")).toEqual({
      left: `${(838 / 1672) * 100}%`,
      top: `${(462 / 941) * 100}%`,
      width: `${(79 / 1672) * 100}%`,
    });
    expect(seatPercent("없는사람")).toBeNull();
  });
});
