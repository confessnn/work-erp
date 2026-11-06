import { describe, expect, it } from "vitest";
import { mergeDaily, openAiCosts, openAiTokens, usageRange } from "./fetch-usage";

const NOV_5 = 1793923200 - 86400; // 2026-11-05T00:00:00Z

describe("usageRange", () => {
  it("오늘을 포함해 31일을 UTC 0시 경계로 잡는다", () => {
    const { start, end } = usageRange(new Date("2026-11-06T15:30:00Z"));
    expect(start.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-07T00:00:00.000Z");
  });
});

describe("OpenAI 응답", () => {
  const bucket = (results: Record<string, unknown>[]) => ({ start_time: NOV_5, results });

  it("달러를 센트로 바꿔 날짜별로 더한다", () => {
    const costs = openAiCosts([bucket([{ amount: { value: 0.06, currency: "usd" } }, { amount: { value: "1.5" } }])]);
    expect(costs.get("2026-11-05")).toBeCloseTo(156);
  });
  it("토큰은 입력과 출력을 더한다", () => {
    expect(openAiTokens([bucket([{ input_tokens: 10, output_tokens: 5 }, { input_tokens: 1 }])]).get("2026-11-05")).toBe(16);
  });
  it("결과가 없는 날은 0", () => {
    expect(openAiCosts([bucket([])]).size).toBe(0);
  });
});

describe("mergeDaily", () => {
  it("날짜순으로 합치고 없는 값은 0", () => {
    expect(mergeDaily(new Map([["2026-11-02", 5]]), new Map([["2026-11-01", 9]]))).toEqual([
      { day: "2026-11-01", cost_cents: 0, tokens: 9 },
      { day: "2026-11-02", cost_cents: 5, tokens: 0 },
    ]);
  });
  it("토큰을 못 받았으면 null", () => {
    expect(mergeDaily(new Map([["2026-11-02", 5]]), null)).toEqual([{ day: "2026-11-02", cost_cents: 5, tokens: null }]);
  });
});
