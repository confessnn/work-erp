import { describe, expect, it } from "vitest";
import { feeFields, feeFrom, isBlankFee, rememberedFees, titleKey, withRememberedFee, type FeeRecord } from "./fee-memory";

const record = (over: Partial<FeeRecord> = {}): FeeRecord => ({
  title: "재경관리사",
  lecture_date: "2026-11-14",
  hours: 3,
  hourly_rate: 50_000,
  gross_amount: 150_000,
  income_type: "business",
  apply_tax_exemption: true,
  ...over,
});

const blank = { title: "재경관리사", hours: 4, hourly_rate: 0, gross_amount: 0, income_tax: 0, local_tax: 0, expected_net: 0 };

describe("titleKey", () => {
  it("띄어쓰기와 대소문자를 무시한다", () => {
    expect(titleKey("백석대 ITQ(ZOOM)")).toBe(titleKey("백석대ITQ(zoom) "));
  });
});

describe("feeFrom", () => {
  it("강의료가 없으면 null", () => {
    expect(feeFrom(record({ hourly_rate: 0, gross_amount: 0 }))).toBeNull();
  });
  it("시간당 강의료는 고정 금액으로 보지 않는다", () => {
    expect(feeFrom(record())).toMatchObject({ hourlyRate: 50_000, fixedGross: null });
  });
  it("시간 × 단가와 다르면 고정 금액이다", () => {
    expect(feeFrom(record({ hourly_rate: 0, gross_amount: 300_000 }))).toMatchObject({ fixedGross: 300_000 });
  });
  it("DB가 시간을 문자열로 줘도 계산한다", () => {
    expect(feeFrom(record({ hours: "3.00" }))?.fixedGross).toBeNull();
  });
});

describe("feeFields", () => {
  it("그 일정의 시간으로 금액과 세금을 다시 계산한다", () => {
    const fee = feeFrom(record())!;
    expect(feeFields(4, fee)).toMatchObject({ hourly_rate: 50_000, gross_amount: 200_000, income_tax: 6_000, local_tax: 600, expected_net: 193_400 });
  });
  it("고정 금액은 시간과 상관없이 그대로 쓴다", () => {
    const fee = feeFrom(record({ hourly_rate: 0, gross_amount: 300_000 }))!;
    expect(feeFields(8, fee).gross_amount).toBe(300_000);
  });
  it("소득 구분과 소액 면제 설정도 물려준다", () => {
    const fee = feeFrom(record({ income_type: "other", hours: 1, hourly_rate: 100_000, gross_amount: 100_000 }))!;
    expect(feeFields(1, fee)).toMatchObject({ income_type: "other", income_tax: 0, expected_net: 100_000 });
  });
});

describe("rememberedFees", () => {
  it("같은 제목이면 가장 최근 날짜의 강의료를 쓴다", () => {
    const fees = rememberedFees([
      record({ lecture_date: "2026-12-01", hourly_rate: 70_000, gross_amount: 210_000 }),
      record({ lecture_date: "2026-11-01" }),
    ]);
    expect(fees.get(titleKey("재경관리사"))?.hourlyRate).toBe(70_000);
  });
  it("강의료가 없는 기록은 기억하지 않는다", () => {
    expect(rememberedFees([record({ hourly_rate: 0, gross_amount: 0 })]).size).toBe(0);
  });
});

describe("withRememberedFee", () => {
  const fees = rememberedFees([record()]);

  it("비어 있는 일정에 같은 제목의 강의료를 넣는다", () => {
    expect(withRememberedFee(blank, fees)).toMatchObject({ hourly_rate: 50_000, gross_amount: 200_000, expected_net: 193_400 });
  });
  it("띄어쓰기가 달라도 찾는다", () => {
    expect(withRememberedFee({ ...blank, title: "재경 관리사" }, fees).hourly_rate).toBe(50_000);
  });
  it("제목이 다르면 그대로 둔다", () => {
    expect(withRememberedFee({ ...blank, title: "전산회계" }, fees)).toMatchObject({ hourly_rate: 0, gross_amount: 0 });
  });
  it("이미 강의료가 있으면 덮어쓰지 않는다", () => {
    expect(withRememberedFee({ ...blank, hourly_rate: 30_000, gross_amount: 120_000 }, fees).hourly_rate).toBe(30_000);
  });
});

describe("isBlankFee", () => {
  it("고정 금액만 있어도 입력된 일정이다", () => {
    expect(isBlankFee({ hourly_rate: 0, gross_amount: 300_000 })).toBe(false);
  });
});
