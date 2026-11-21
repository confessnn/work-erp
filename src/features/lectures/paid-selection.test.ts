import { describe, expect, it } from "vitest";
import { datesLabel, unpaidOnDates } from "./paid-selection";

const rows = [
  { id: "a", lecture_date: "2026-11-14", is_paid: false, expected_net: 100000, gross_amount: 103000 },
  { id: "b", lecture_date: "2026-11-14", is_paid: true, expected_net: 50000, gross_amount: 51500 },
  { id: "c", lecture_date: "2026-11-21", is_paid: false, expected_net: 30000, gross_amount: 31000 },
  { id: "d", lecture_date: "2026-11-22", is_paid: false, expected_net: 70000, gross_amount: 72000 },
  { id: "e", lecture_date: "2026-11-21", is_paid: false, expected_net: 0, gross_amount: 0 },
];

describe("unpaidOnDates", () => {
  it("고른 날짜의 미수령 일정만 모으고 금액을 더한다", () => {
    expect(unpaidOnDates(rows, ["2026-11-14", "2026-11-21"])).toEqual({ ids: ["a", "c"], total: 130000 });
  });
  it("강의료를 입력하지 않은 일정은 빠진다", () => {
    expect(unpaidOnDates(rows, ["2026-11-21"])).toEqual({ ids: ["c"], total: 30000 });
    expect(unpaidOnDates([rows[4]], ["2026-11-21"])).toEqual({ ids: [], total: 0 });
  });
  it("일정 없는 날짜나 이미 수령한 날짜만 고르면 비어 있다", () => {
    expect(unpaidOnDates(rows, ["2026-11-01"])).toEqual({ ids: [], total: 0 });
    expect(unpaidOnDates([rows[1]], ["2026-11-14"])).toEqual({ ids: [], total: 0 });
  });
});

describe("datesLabel", () => {
  it("날짜순으로 월/일 표시", () => {
    expect(datesLabel(["2026-11-21", "2026-11-03"])).toBe("11/3, 11/21");
  });
});
