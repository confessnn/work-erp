import { describe, expect, it } from "vitest";
import { datesLabel, unpaidOnDates } from "./paid-selection";

const rows = [
  { id: "a", lecture_date: "2026-11-14", is_paid: false, expected_net: 100000 },
  { id: "b", lecture_date: "2026-11-14", is_paid: true, expected_net: 50000 },
  { id: "c", lecture_date: "2026-11-21", is_paid: false, expected_net: 30000 },
  { id: "d", lecture_date: "2026-11-22", is_paid: false, expected_net: 70000 },
];

describe("unpaidOnDates", () => {
  it("고른 날짜의 미수령 일정만 모으고 금액을 더한다", () => {
    expect(unpaidOnDates(rows, ["2026-11-14", "2026-11-21"])).toEqual({ ids: ["a", "c"], total: 130000 });
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
