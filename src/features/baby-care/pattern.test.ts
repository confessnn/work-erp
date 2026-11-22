import { describe, expect, it } from "vitest";
import type { BabyLog } from "./care";
import { daySegments, parseKinds, shiftDay } from "./pattern";

const log = (o: Partial<BabyLog>): BabyLog => ({
  id: Math.random().toString(36),
  kind: "formula",
  started_at: "2026-11-21T01:00:00Z", // 서울 10:00
  ended_at: null,
  amount_ml: null,
  value: null,
  height_cm: null,
  side: null,
  diaper: null,
  poo_color: null,
  label: null,
  note: null,
  ...o,
});
const NOW = Date.parse("2026-11-22T04:00:00Z"); // 서울 11/22 13:00

describe("daySegments", () => {
  it("시각만 있는 기록은 최소 6분 폭", () => {
    const [s] = daySegments([log({})], "2026-11-21", NOW);
    expect(s).toMatchObject({ start: 600, end: 606 });
  });
  it("끝난 시각이 있으면 그만큼", () => {
    const [s] = daySegments([log({ ended_at: "2026-11-21T01:12:00Z" })], "2026-11-21", NOW);
    expect(s).toMatchObject({ start: 600, end: 612 });
  });
  it("자정을 넘긴 잠은 그날 몫만, 다음 날에도 나머지", () => {
    const sleep = log({ kind: "sleep", started_at: "2026-11-21T14:00:00Z", ended_at: "2026-11-21T17:00:00Z" }); // 23:00~02:00
    expect(daySegments([sleep], "2026-11-21", NOW)[0]).toMatchObject({ start: 1380, end: 1440 });
    expect(daySegments([sleep], "2026-11-22", NOW)[0]).toMatchObject({ start: 0, end: 120 });
  });
  it("자는 중이면 지금까지", () => {
    const sleep = log({ kind: "sleep", started_at: "2026-11-22T03:00:00Z" }); // 12:00~
    expect(daySegments([sleep], "2026-11-22", NOW)[0]).toMatchObject({ start: 720, end: 780 });
  });
  it("고른 종류만, 다른 날 기록은 빼고, 긴 조각 먼저", () => {
    const logs = [
      log({ kind: "diaper" }),
      log({ kind: "formula", started_at: "2026-11-21T02:00:00Z", ended_at: "2026-11-21T02:30:00Z" }),
      log({ kind: "formula", started_at: "2026-11-23T02:00:00Z" }),
    ];
    const s = daySegments(logs, "2026-11-21", NOW, ["formula", "diaper"]);
    expect(s.map((x) => x.end - x.start)).toEqual([30, 6]);
    expect(daySegments(logs, "2026-11-21", NOW, ["formula"])).toHaveLength(1);
  });
});

describe("기타", () => {
  it("shiftDay", () => {
    expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
  });
  it("parseKinds: 주소에 없으면 기본값, 빈 값이면 아무것도, 모르는 값은 무시", () => {
    const all = ["formula", "diaper", "sleep"] as const;
    expect(parseKinds(undefined, [...all], ["sleep"])).toEqual(["sleep"]);
    expect(parseKinds("", [...all], ["sleep"])).toEqual([]);
    expect(parseKinds("diaper,xx,formula", [...all], [])).toEqual(["formula", "diaper"]);
  });
});
