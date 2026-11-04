import { describe, expect, it } from "vitest";
import { calculateWithholding, grossFrom, hoursBetween } from "./tax";

describe("calculateWithholding", () => {
  it("사업소득 3.3%", () => {
    expect(calculateWithholding(1_000_000, "business")).toEqual({
      incomeTax: 30_000,
      localTax: 3_000,
      totalTax: 33_000,
      net: 967_000,
    });
  });

  it("기타소득 8.8%", () => {
    expect(calculateWithholding(1_000_000, "other")).toEqual({
      incomeTax: 80_000,
      localTax: 8_000,
      totalTax: 88_000,
      net: 912_000,
    });
  });

  it("원단위 절사", () => {
    // 333,333 × 3% = 9,999.99 → 9,990 / 지방세 999 → 990
    const r = calculateWithholding(333_333, "business");
    expect(r.incomeTax).toBe(9_990);
    expect(r.localTax).toBe(990);
    expect(r.net).toBe(333_333 - 10_980);
  });

  it("기타소득 과세최저한: 12.5만 원 이하면 0원", () => {
    expect(calculateWithholding(125_000, "other").totalTax).toBe(0);
    expect(calculateWithholding(125_010, "other").totalTax).toBeGreaterThan(0);
  });

  it("과세최저한 미적용 선택 시 그대로 8.8%", () => {
    expect(calculateWithholding(125_000, "other", false).totalTax).toBe(11_000);
  });

  it("사업소득 소액부징수: 소득세 1,000원 미만이면 0원", () => {
    expect(calculateWithholding(30_000, "business").totalTax).toBe(0); // 소득세 900
    expect(calculateWithholding(30_000, "business", false).totalTax).toBe(990);
    expect(calculateWithholding(40_000, "business").totalTax).toBe(1_320);
  });
});

describe("hoursBetween / grossFrom", () => {
  it("시간 계산", () => {
    expect(hoursBetween("09:00", "12:00")).toBe(3);
    expect(hoursBetween("13:30", "15:00")).toBe(1.5);
    expect(hoursBetween("15:00", "13:00")).toBe(0);
    expect(hoursBetween(null, "13:00")).toBe(0);
  });

  it("강의료 = 시간 × 시간당", () => {
    expect(grossFrom(1.5, 200_000)).toBe(300_000);
  });
});
