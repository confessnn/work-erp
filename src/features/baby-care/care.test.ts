import { describe as group, expect, it } from "vitest";
import { addMinutesLocal, agoLabel, daySummary, describe, durationLabel, fromLocalInput, latest, toLocalInput, type BabyLog } from "./care";

const log = (o: Partial<BabyLog>): BabyLog => ({
  id: Math.random().toString(36),
  kind: "formula",
  started_at: "2026-11-22T01:00:00Z", // 서울 10:00
  ended_at: null,
  amount_ml: null,
  value: null,
  side: null,
  diaper: null,
  poo_color: null,
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

group("유축·수유 시간·대변 색", () => {
  it("유축은 짠 양으로 따로 세고 수유량에는 넣지 않는다", () => {
    const s = daySummary([log({ kind: "pump", amount_ml: 50 }), log({ kind: "formula", amount_ml: 100 })], "2026-11-22", NOW);
    expect(s.feedMl).toBe(100);
    expect(s.feeds).toBe(1);
    expect(s.pumpMl).toBe(50);
    expect(s.pumpCount).toBe(1);
  });
  it("분유·유축에 끝난 시각이 있으면 걸린 시간을 보여 준다", () => {
    expect(describe(log({ kind: "formula", amount_ml: 70, ended_at: "2026-11-22T01:10:00Z" }), NOW)).toBe("70ml · 10분");
    expect(describe(log({ kind: "pump", amount_ml: 50, side: "both", ended_at: "2026-11-22T01:20:00Z" }), NOW)).toBe("50ml · 양쪽 · 20분");
  });
  it("대변 색은 대변일 때만 보인다", () => {
    expect(describe(log({ kind: "diaper", diaper: "poo", poo_color: "green" }), NOW)).toBe("대변 · 초록색");
    expect(describe(log({ kind: "diaper", diaper: "pee", poo_color: "green" }), NOW)).toBe("소변");
  });
  it("addMinutesLocal: 자정을 넘겨도 한국 시간으로 더한다", () => {
    expect(addMinutesLocal("2026-11-21T23:55", 10)).toBe("2026-11-22T00:05");
    expect(addMinutesLocal("2026-11-22T00:05", -10)).toBe("2026-11-21T23:55");
    expect(addMinutesLocal("bad", 10)).toBeNull();
  });
});
