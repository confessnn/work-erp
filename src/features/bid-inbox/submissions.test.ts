import { describe, expect, it } from "vitest";
import { matchOpening, summarize } from "./submissions";

const rows = [
  { rank: 1, bizno: "1111111111", amount: 128_585_390, rate: 86.294, remark: "정상" },
  { rank: 2, bizno: "3018216304", amount: 128_703_000, rate: 86.373, remark: "정상" },
  { rank: 3, bizno: "2222222222", amount: 128_754_635, rate: 86.408, remark: "정상" },
];

describe("matchOpening", () => {
  it("우리 순위와 1등 투찰률을 찾고 결과를 정한다", () => {
    expect(matchOpening(rows, "3018216304", false)).toEqual({
      rank: 2,
      participants: 3,
      open_rate: 86.373,
      winner_rate: 86.294,
      winner_amount: 128_585_390,
      result: "lost",
    });
    expect(matchOpening(rows, "1111111111", false)?.result).toBe("won");
  });
  it("협상은 순위만 적고 결과는 대기", () => {
    expect(matchOpening(rows, "1111111111", true)?.result).toBe("pending");
  });
  it("우리 번호가 없으면 null", () => {
    expect(matchOpening(rows, "9999999999", false)).toBeNull();
  });
});

it("summarize", () => {
  const s = summarize([
    { result: "won", open_rate: 86.3, winner_rate: 86.3 },
    { result: "lost", open_rate: 86.5, winner_rate: 86.3 },
    { result: "pending", open_rate: null, winner_rate: null },
  ]);
  expect(s.total).toBe(3);
  expect(s.won).toBe(1);
  expect(s.winRate).toBe(50);
  expect(s.avgGap).toBeCloseTo(0.1, 5);
});
