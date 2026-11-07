import { describe, expect, it } from "vitest";
import { monthGrid } from "./month-grid";

describe("monthGrid", () => {
  it("2026년 11월은 일요일에 시작해 5주", () => {
    const w = monthGrid(2026, 11);
    expect(w).toHaveLength(5);
    expect(w[0][0]).toEqual({ date: "2026-11-01", day: 1 });
    expect(w[4][1]).toEqual({ date: "2026-11-30", day: 30 });
    expect(w[4].slice(2)).toEqual([null, null, null, null, null]);
  });

  it("앞쪽 빈칸과 6주짜리 달", () => {
    const w = monthGrid(2026, 8); // 8/1 토요일, 31일
    expect(w).toHaveLength(6);
    expect(w[0].slice(0, 6).every((c) => c === null)).toBe(true);
    expect(w[0][6]).toEqual({ date: "2026-08-01", day: 1 });
  });

  it("윤년 2월과 4주짜리 달", () => {
    expect(monthGrid(2028, 2).flat().filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2026, 2)).toHaveLength(4); // 2/1 일요일, 28일
  });
});
