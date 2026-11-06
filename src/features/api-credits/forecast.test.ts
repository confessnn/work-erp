import { describe, expect, it } from "vitest";
import { forecast, parseCents, type ForecastInput } from "./forecast";
import type { DailyUsage } from "./types";

const day = (d: string, cost_cents: number, tokens: number | null = null): DailyUsage => ({ day: d, cost_cents, tokens });

const base: ForecastInput = {
  today: "2026-11-10",
  usage: [],
  baseBalance: 500,
  baseDate: "2026-11-03",
  baseDayCost: 0,
  threshold: 200,
  reloadAmount: 500,
  reloadMode: "add",
};
const week = ["04", "05", "06", "07", "08", "09"].map((d) => day(`2026-11-${d}`, 30));

describe("parseCents", () => {
  it("달러를 센트로 바꾼다", () => {
    expect(parseCents("$5", "금액")).toBe(500);
    expect(parseCents("1,234.56", "금액")).toBe(123456);
    expect(parseCents(" ", "금액")).toBeNull();
  });
  it("잘못된 값은 막는다", () => {
    expect(() => parseCents("abc", "충전 기준")).toThrow("충전 기준");
    expect(() => parseCents("-1", "충전 기준")).toThrow();
  });
});

describe("예상 잔액", () => {
  it("기준일 이후 사용액을 뺀다", () => {
    expect(forecast({ ...base, usage: [day("2026-11-05", 100), day("2026-11-02", 999)] }).balance).toBe(400);
  });
  it("기준일에는 입력 뒤에 쓴 금액만 뺀다", () => {
    expect(forecast({ ...base, usage: [day("2026-11-03", 150)], baseDayCost: 100 }).balance).toBe(450);
    expect(forecast({ ...base, usage: [day("2026-11-03", 50)], baseDayCost: 100 }).balance).toBe(500);
  });
  it("기준 아래로 내려가면 충전한 것으로 계산한다", () => {
    const f = forecast({ ...base, usage: [day("2026-11-05", 350)] });
    expect(f).toMatchObject({ balance: 650, reloads: 1, reloadedTotal: 500 });
  });
  it("정해진 잔액까지 채우는 방식", () => {
    const f = forecast({ ...base, reloadMode: "to", usage: [day("2026-11-05", 350)] });
    expect(f).toMatchObject({ balance: 500, reloads: 1, reloadedTotal: 350 });
  });
  it("하루에 크게 쓰면 여러 번 충전한다", () => {
    expect(forecast({ ...base, usage: [day("2026-11-05", 1000)] })).toMatchObject({ balance: 500, reloads: 2 });
  });
  it("채울 잔액이 기준보다 낮은 설정이면 끝없이 충전하지 않는다", () => {
    expect(forecast({ ...base, reloadMode: "to", reloadAmount: 100, usage: [day("2026-11-05", 400)] })).toMatchObject({ balance: 100, reloads: 0 });
  });
  it("기준 잔액이 없으면 잔액을 모른다", () => {
    expect(forecast({ ...base, baseBalance: null, usage: week })).toMatchObject({ balance: null, daysLeft: null });
  });
});

describe("이번 달 사용량", () => {
  it("이번 달만 더한다", () => {
    const f = forecast({ ...base, usage: [day("2026-10-31", 100, 5), day("2026-11-01", 10, 7), day("2026-11-02", 20, 3)] });
    expect(f.monthCost).toBe(30);
    expect(f.monthTokens).toBe(10);
  });
  it("토큰을 못 받았으면 null", () => {
    expect(forecast({ ...base, usage: [day("2026-11-01", 10)] }).monthTokens).toBeNull();
  });
});

describe("다음 자동 충전", () => {
  it("최근 7일 평균으로 날짜를 낸다", () => {
    // 사용 180, 평균 180/7 ≒ 25.7. 잔액 320 - 기준 200 = 120 → 4.67일 → 5일 뒤
    const f = forecast({ ...base, usage: week });
    expect(f.balance).toBe(320);
    expect(f.daysLeft).toBe(5);
    expect(f.nextReloadDate).toBe("2026-11-15");
    expect(f.nextReloadAmount).toBe(500);
  });
  it("집계 중인 오늘은 평균에서 뺀다", () => {
    const f = forecast({ ...base, usage: [...week, day("2026-11-10", 9000)] });
    expect(f.dailyAverage).toBeCloseTo(180 / 7);
  });
  it("채우는 방식이면 기준에서 채울 잔액까지의 차이가 충전액이다", () => {
    expect(forecast({ ...base, reloadMode: "to", usage: week }).nextReloadAmount).toBe(300);
  });
  it("사용한 날이 적으면 날짜를 내지 않는다", () => {
    expect(forecast({ ...base, usage: [day("2026-11-09", 100)] })).toMatchObject({ daysLeft: null, nextReloadDate: null });
  });
  it("이미 기준 근처면 0일", () => {
    expect(forecast({ ...base, baseBalance: 380, usage: week }).daysLeft).toBe(0);
  });
  it("자동 충전을 안 넣었으면 날짜를 내지 않는다", () => {
    expect(forecast({ ...base, threshold: null, reloadAmount: null, usage: week })).toMatchObject({ balance: 320, daysLeft: null });
  });
});
