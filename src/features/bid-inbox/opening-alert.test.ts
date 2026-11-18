import { describe, expect, it } from "vitest";
import { openingTelegram } from "./opening-alert";

const d = { title: "2027년 정수기 <원가> 용역", notice_org: "교육청", plan: "balanced" as const };

describe("openingTelegram", () => {
  it("탈락: 순위와 1등과의 차이를 적는다", () => {
    const m = openingTelegram(d, { rank: 3, participants: 12, open_rate: 87.745, winner_rate: 87.7, winner_amount: 1, result: "lost" });
    expect(m.html).toContain("탈락");
    expect(m.html).toContain("순위 3 / 12곳 · 균형안");
    expect(m.html).toContain("차이 +0.045%p");
    expect(m.html).toContain("&lt;원가&gt;");
    expect(m.buttons[0].url).toBe("https://work-erp-one.vercel.app/bids/records");
  });
  it("낙찰과 협상", () => {
    expect(openingTelegram(d, { rank: 1, participants: 5, open_rate: 88, winner_rate: 88, winner_amount: 1, result: "won" }).html).toContain("낙찰!");
    expect(openingTelegram(d, { rank: 2, participants: 5, open_rate: null, winner_rate: null, winner_amount: 0, result: "pending" }).html).toContain("기술평가");
  });
});
