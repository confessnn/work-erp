import { describe, expect, it } from "vitest";
import type { BabyLog } from "./care";
import { dayGapStats, daySegments, INTERVAL_GROUPS, parseKinds, sessions, shiftDay } from "./pattern";

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

const G = (k: string) => INTERVAL_GROUPS.find((g) => g.key === k)!;
const at = (hhmm: string, day = "2026-11-21") => new Date(`${day}T${hhmm}:00+09:00`).toISOString();

describe("간격패턴", () => {
  it("수유: 30분 안에 이어 먹은 것은 한 번으로, 간격은 앞 수유 시작부터", () => {
    const logs = [
      log({ kind: "formula", started_at: at("22:29", "2026-11-20") }),
      log({ kind: "formula", started_at: at("23:00", "2026-11-20") }), // 31분 뒤 → 따로
      log({ kind: "formula", started_at: at("02:08") }),
      log({ kind: "pumped", started_at: at("05:31") }),
      log({ kind: "formula", started_at: at("05:45") }), // 14분 뒤 → 합침
      log({ kind: "diaper", diaper: "pee", started_at: at("06:00") }), // 다른 묶음
      log({ kind: "formula", started_at: at("08:47") }),
    ];
    const s = sessions(logs, G("feed"));
    expect(s.map((x) => x.gap)).toEqual([null, 31, 188, 203, 196]);
    expect(s[3].ids).toHaveLength(2);
    expect(dayGapStats(s, "2026-11-21")).toEqual({ count: 3, avg: 196, min: 188, max: 203 });
  });
  it("대변만 고르면 소변은 빼고, 기록이 없으면 null", () => {
    const logs = [
      log({ kind: "diaper", diaper: "poo", started_at: at("08:00") }),
      log({ kind: "diaper", diaper: "pee", started_at: at("09:00") }),
      log({ kind: "diaper", diaper: "both", started_at: at("20:00") }),
    ];
    expect(sessions(logs, G("poo")).map((x) => x.gap)).toEqual([null, 720]);
    expect(dayGapStats([], "2026-11-21")).toEqual({ count: 0, avg: null, min: null, max: null });
  });
});
