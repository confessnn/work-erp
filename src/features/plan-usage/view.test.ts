import { describe, expect, it } from "vitest";
import { parseClaude, parseCodex, shouldReadCodex, shouldReport, statusText } from "../../../scripts/plan-usage/parse.mjs";
import { usageBar } from "./view";

describe("shouldReadCodex", () => {
  it("요청이 있으면 바로 읽는다", () => {
    expect(shouldReadCodex(990, true, 1000, 300)).toBe(true);
  });
  it("요청이 없으면 간격이 지나야 읽는다", () => {
    expect(shouldReadCodex(990, false, 1000, 300)).toBe(false);
    expect(shouldReadCodex(700, false, 1000, 300)).toBe(true);
  });
  it("처음이면 읽는다", () => {
    expect(shouldReadCodex(null, false, 1000, 300)).toBe(true);
  });
});

const NOW = Date.parse("2026-11-07T00:00:00Z");

describe("usageBar", () => {
  it("값이 없으면 막대가 없다", () => {
    expect(usageBar("5시간 제한", null, null, NOW, false)).toBeNull();
  });
  it("초기화 시각을 한국 시간으로 보여 준다", () => {
    const bar = usageBar("5시간 제한", 4, "2026-11-06T20:10:00Z", Date.parse("2026-11-06T18:00:00Z"), false);
    expect(bar).toMatchObject({ percent: 4, level: "normal" });
    expect(bar?.reset).toContain("5:10");
    expect(bar?.reset).toContain("오전");
  });
  it("주간 창은 요일도 보여 준다", () => {
    expect(usageBar("주간", 2, "2026-11-13T13:00:00Z", NOW, true)?.reset).toContain("금");
  });
  it("초기화가 지났으면 0%로 본다", () => {
    expect(usageBar("5시간 제한", 80, "2026-11-06T20:10:00Z", NOW, false)).toMatchObject({ percent: 0, reset: "초기화됨", level: "normal" });
  });
  it("사용량이 많으면 표시를 바꾼다", () => {
    expect(usageBar("a", 70, null, NOW, false)?.level).toBe("warn");
    expect(usageBar("a", 90, null, NOW, false)?.level).toBe("high");
    expect(usageBar("a", 130, null, NOW, false)?.percent).toBe(100);
  });
});

describe("parseClaude", () => {
  it("상태줄 입력에서 한도를 읽는다", () => {
    const u = parseClaude({ rate_limits: { five_hour: { used_percentage: 4, resets_at: 1794000000 }, seven_day: { used_percentage: 2.5, resets_at: 1794500000 } } });
    expect(u).toMatchObject({ fiveHourPercent: 4, weeklyPercent: 2.5, fiveHourResetsAt: new Date(1794000000000).toISOString() });
  });
  it("한쪽 창만 있어도 읽는다", () => {
    expect(parseClaude({ rate_limits: { seven_day: { used_percentage: 3 } } })).toMatchObject({ fiveHourPercent: null, weeklyPercent: 3, weeklyResetsAt: null });
  });
  it("한도 정보가 없으면 null", () => {
    expect(parseClaude({ model: {} })).toBeNull();
    expect(parseClaude(null)).toBeNull();
  });
});

describe("parseCodex", () => {
  const limits = { planType: "plus", primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1793997795 }, secondary: { usedPercent: 4, windowDurationMins: 10080, resetsAt: 1794380593 }, credits: { balance: "447.9623000000" } };

  it("실제 응답 형식을 읽는다", () => {
    expect(parseCodex({ rateLimits: limits })).toMatchObject({ plan: "plus", fiveHourPercent: 0, weeklyPercent: 4, creditsBalance: 447.9623 });
  });
  it("primary·secondary 이름이 아니라 기간으로 구분한다", () => {
    const swapped = { ...limits, primary: limits.secondary, secondary: limits.primary };
    expect(parseCodex({ rateLimits: swapped })).toMatchObject({ fiveHourPercent: 0, weeklyPercent: 4 });
  });
  it("크레딧이 없으면 null", () => {
    expect(parseCodex({ rateLimits: { ...limits, credits: null } })?.creditsBalance).toBeNull();
  });
  it("아는 창이 없으면 null", () => {
    expect(parseCodex({ rateLimits: { primary: { usedPercent: 1, windowDurationMins: 60 } } })).toBeNull();
    expect(parseCodex({})).toBeNull();
  });
});

describe("statusText", () => {
  it("상태줄 글자를 만든다", () => {
    expect(statusText({ fiveHourPercent: 3.6, weeklyPercent: 2 })).toBe("5시간 4% · 주간 2%");
    expect(statusText({ fiveHourPercent: null, weeklyPercent: 2 })).toBe("주간 2%");
    expect(statusText(null)).toBe("");
  });
});

describe("shouldReport", () => {
  const usage = { fiveHourPercent: 4, weeklyPercent: 2 };
  it("처음이거나 값이 바뀌면 보낸다", () => {
    expect(shouldReport(null, usage, 1000, 300)).toBe(true);
    expect(shouldReport({ at: 900, fiveHourPercent: 3, weeklyPercent: 2 }, usage, 1000, 300)).toBe(true);
  });
  it("같은 값이면 간격이 지나야 보낸다", () => {
    expect(shouldReport({ at: 900, ...usage }, usage, 1000, 300)).toBe(false);
    expect(shouldReport({ at: 600, ...usage }, usage, 1000, 300)).toBe(true);
  });
  it("값이 없으면 보내지 않는다", () => {
    expect(shouldReport(null, null, 1000, 300)).toBe(false);
  });
});
