import { describe, expect, it } from "vitest";
import { holidaysBetween, holidaysOfMonth, pickBetween, pickMonth, shortHoliday } from "./holidays";

describe("공휴일", () => {
  it("2026년 9월: 추석 연휴 사흘", async () => {
    expect(await holidaysOfMonth(2026, 9)).toEqual({ "2026-09-24": "추석 전날", "2026-09-25": "추석", "2026-09-26": "추석 다음 날" });
  });
  it("대체공휴일·선거일도 들어 있다 (2026년 3·6월)", async () => {
    expect((await holidaysOfMonth(2026, 3))["2026-03-02"]).toBe("대체공휴일(3ㆍ1절)");
    expect((await holidaysOfMonth(2026, 6))["2026-06-03"]).toBe("전국동시지방선거");
  });
  it("공휴일 없는 달, 자료 없는 해는 빈 목록", async () => {
    expect(await holidaysOfMonth(2026, 11)).toEqual({});
    expect(await holidaysOfMonth(2099, 1)).toEqual({});
  });
  it("기간으로 고르면 시작일은 넣고 끝일은 뺀다", () => {
    const preset = { "2027-01-01": ["A"], "2027-01-02": ["B"], "2027-01-03": ["C"] };
    expect(pickBetween(preset, "2027-01-02", "2027-01-03")).toEqual({ "2027-01-02": "B" });
  });

  it("해를 걸치는 기간은 두 해 자료를 합친다 (2026-12-27 ~ 2027-01-02)", async () => {
    const h = await holidaysBetween("2026-12-27", "2027-01-03");
    expect(h["2027-01-01"]).toBeTruthy();
    expect(h["2026-12-25"]).toBeUndefined();
  });

  it("하루에 둘이면 합치고, 짧은 이름은 괄호를 뗀다", () => {
    expect(pickMonth({ "2027-01-01": ["A", "B"], "2027-02-01": ["C"] }, 2027, 1)).toEqual({ "2027-01-01": "A·B" });
    expect(shortHoliday("대체공휴일(광복절)")).toBe("대체공휴일");
  });
});
