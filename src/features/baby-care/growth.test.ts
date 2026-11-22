import { describe, expect, it } from "vitest";
import { assess, compareAge, curve, dailyFeedGuide, normCdf, percentileLabel } from "./growth";

describe("WHO 성장 백분위", () => {
  it("중앙값은 50백분위", () => {
    // WHO 남아 0일 몸무게 중앙값 3.3464kg, 키 49.8842cm
    expect(assess("weight", "male", 0, 3.3464)!.percentile).toBeCloseTo(50, 3);
    expect(assess("length", "male", 0, 49.8842)!.z).toBeCloseTo(0, 6);
  });
  it("WHO 표와 같은 값: 남아 46일 키 +1SD = 56.7269 × (1 + 0.03483)", () => {
    expect(assess("length", "male", 46, 56.7269 * 1.03483)!.z).toBeCloseTo(1, 4);
  });
  it("97백분위 선 위의 값은 97백분위", () => {
    const top = curve("weight", "female", 100, 100)[0].p97;
    expect(assess("weight", "female", 100, top)!.percentile).toBeCloseTo(97, 1);
  });
  it("아주 가벼우면 WHO 규칙(±3 바깥 보정)으로 계산하고 0.1백분위 미만", () => {
    const a = assess("weight", "male", 0, 1.5)!;
    expect(a.z).toBeLessThan(-3);
    expect(percentileLabel(a.percentile)).toBe("0.1백분위 미만");
  });
  it("범위 밖 나이·값은 null", () => {
    expect(assess("weight", "male", 731, 10)).toBeNull();
    expect(assess("weight", "male", 10, 0)).toBeNull();
  });
  it("normCdf", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.880794)).toBeCloseTo(0.97, 4);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("나이·교정 나이", () => {
  it("만삭이면 실제 나이", () => {
    expect(compareAge("2026-10-07", "2026-11-22", null)).toEqual({ age: 46, corrected: false, days: 46 });
    expect(compareAge("2026-10-07", "2026-11-22", 38)).toEqual({ age: 46, corrected: false, days: 46 });
  });
  it("34주 이른둥이는 6주(42일)를 빼고, 예정일 전이면 비교하지 않는다", () => {
    expect(compareAge("2026-10-07", "2026-11-22", 34)).toEqual({ age: 46, corrected: true, days: 4 });
    expect(compareAge("2026-10-07", "2026-10-20", 34).days).toBeNull();
  });
  it("36주 4일은 24일을 빼고, 37주 0일부터는 빼지 않는다", () => {
    expect(compareAge("2026-10-07", "2026-11-21", 36, 4)).toEqual({ age: 45, corrected: true, days: 21 });
    expect(compareAge("2026-10-07", "2026-10-07", 36, 4).days).toBeNull();
    expect(compareAge("2026-10-07", "2026-11-21", 37, 0).corrected).toBe(false);
  });
});

describe("기타", () => {
  it("percentileLabel", () => {
    expect(percentileLabel(42.4)).toBe("42백분위");
    expect(percentileLabel(0.55)).toBe("0.6백분위");
    expect(percentileLabel(99.95)).toBe("99.9백분위 초과");
  });
  it("수유 기준량: 체중 × 150ml", () => {
    expect(dailyFeedGuide(4.25)).toBe(640);
    expect(dailyFeedGuide(2.2)).toBe(330);
  });
});
