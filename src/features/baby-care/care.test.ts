import { describe as group, expect, it } from "vitest";
import { agoLabel, daySummary, describe, durationLabel, fromLocalInput, latest, toLocalInput, type BabyLog } from "./care";

const log = (o: Partial<BabyLog>): BabyLog => ({
  id: Math.random().toString(36),
  kind: "formula",
  started_at: "2026-11-22T01:00:00Z", // 서울 10:00
  ended_at: null,
  amount_ml: null,
  value: null,
  side: null,
  diaper: null,
  label: null,
  note: null,
  ...o,
});
const NOW = Date.parse("2026-11-22T12:00:00Z"); // 서울 21:00

group("daySummary", () => {
  const logs = [
    log({ kind: "formula", amount_ml: 120 }),
    log({ kind: "pumped", amount_ml: 80 }),
    log({ kind: "breast", side: "left", started_at: "2026-11-22T03:00:00Z", ended_at: "2026-11-22T03:15:00Z" }),
    log({ kind: "diaper", diaper: "pee" }),
    log({ kind: "diaper", diaper: "both" }),
    log({ kind: "diaper", diaper: "poo" }),
    log({ kind: "water", amount_ml: 30 }),
    log({ kind: "solid", value: 50 }),
    // 전날 밤 22:00(서울) ~ 오늘 02:00 잠 → 오늘 몫 2시간
    log({ kind: "sleep", started_at: "2026-11-21T13:00:00Z", ended_at: "2026-11-21T17:00:00Z" }),
    // 지금 자는 중: 서울 20:30부터 → 30분
    log({ kind: "sleep", started_at: "2026-11-22T11:30:00Z" }),
    // 어제 기록은 빠진다
    log({ kind: "formula", amount_ml: 999, started_at: "2026-11-21T01:00:00Z" }),
  ];
  const s = daySummary(logs, "2026-11-22", NOW);

  it("기저귀 횟수와 소변·대변", () => {
    expect([s.diapers, s.pee, s.poo]).toEqual([3, 2, 2]);
  });
  it("총 수유량 = 분유 + 유축, 모유는 횟수·시간", () => {
    expect([s.feedMl, s.formulaMl, s.pumpedMl, s.feeds, s.breastCount, s.breastMin]).toEqual([200, 120, 80, 3, 1, 15]);
  });
  it("잠은 자정을 넘기면 나눠 세고, 자는 중이면 지금까지", () => {
    expect(s.sleepMin).toBe(150);
  });
  it("물·이유식", () => {
    expect([s.waterMl, s.solidG]).toEqual([30, 50]);
  });
});

group("latest / agoLabel / 표시", () => {
  it("가장 최근 수유", () => {
    const a = log({ kind: "formula", started_at: "2026-11-22T01:00:00Z" });
    const b = log({ kind: "breast", started_at: "2026-11-22T05:00:00Z" });
    expect(latest([a, b, log({ kind: "diaper", started_at: "2026-11-22T09:00:00Z" })], ["formula", "breast", "pumped"])).toBe(b);
    expect(latest([], ["sleep"])).toBeNull();
  });
  it("경과 시간", () => {
    expect(agoLabel("2026-11-22T12:00:00Z", NOW)).toBe("방금");
    expect(agoLabel("2026-11-22T11:35:00Z", NOW)).toBe("25분 전");
    expect(agoLabel("2026-11-22T08:48:00Z", NOW)).toBe("3시간 12분 전");
    expect(durationLabel(90)).toBe("1시간 30분");
    expect(durationLabel(120)).toBe("2시간");
  });
  it("한 줄 설명", () => {
    expect(describe(log({ kind: "formula", amount_ml: 120 }), NOW)).toBe("120ml");
    expect(describe(log({ kind: "diaper", diaper: "both" }), NOW)).toBe("소변+대변");
    expect(describe(log({ kind: "temperature", value: 37.5 }), NOW)).toBe("37.5℃");
    expect(describe(log({ kind: "sleep", started_at: "2026-11-22T11:00:00Z" }), NOW)).toBe("자는 중 · 1시간째");
    expect(describe(log({ kind: "medicine", label: "해열제 2.5ml" }), NOW)).toBe("해열제 2.5ml");
  });
  it("시간 입력칸 왕복 (한국 시간)", () => {
    expect(toLocalInput("2026-11-22T15:30:00Z")).toBe("2026-11-23T00:30");
    expect(fromLocalInput("2026-11-23T00:30")).toBe("2026-11-22T15:30:00.000Z");
    expect(fromLocalInput("아무거나")).toBeNull();
  });
});
