import { describe, expect, it } from "vitest";
import type { DigestNotice } from "@/features/bid-inbox/digest";
import type { AgendaItem } from "@/features/bid-inbox/morning";
import { buildMorningTelegram, reminderMessage, splitMessage, tgEscape } from "./format";

const notice = (over: Partial<DigestNotice> = {}): DigestNotice => ({
  id: "n1",
  category: "hanil",
  title: "OO초 <방수> 공사",
  verdict: "possible",
  verdict_reason: null,
  notice_org: "OO교육청",
  presumed_price: 120_000_000,
  closes_at: "2026-11-20T08:00:00Z",
  detail_url: "https://www.g2b.go.kr/x?a=1&b=2",
  summary: null,
  summary_error: null,
  ...over,
});
const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  kind: "lecture",
  event_date: "2026-11-18",
  start_time: "14:00:00",
  end_time: "16:00:00",
  title: "원가 특강",
  place: "OO대학교",
  person: null,
  ...over,
});

describe("buildMorningTelegram", () => {
  const msgs = buildMorningTelegram(
    "2026-11-18",
    "2026-11-19",
    [item(), item({ kind: "family", event_date: "2026-11-19", start_time: null, end_time: null, title: "예방접종", place: null, person: "baby" })],
    [notice(), notice({ id: "n2", category: "cost", title: "원가 용역", summary: "요약" })],
    ["오늘 공고 수신 기록이 없습니다."],
  );
  const text = msgs.join("\n");

  it("오늘·내일 일정, 공고, 문제를 담는다", () => {
    expect(text).toContain("<b>14:00~16:00</b> 원가 특강 · OO대학교 <i>(강의)</i>");
    expect(text).toContain("<b>종일</b> 예방접종 <i>(아기)</i>");
    expect(text).toContain("새 입찰 공고 2건");
    expect(text).toContain("⚠️ 오늘 공고 수신 기록이 없습니다.");
    expect(text).toContain("요약 있음");
  });

  it("외부 글은 이스케이프, 링크 주소의 &도", () => {
    expect(text).toContain("OO초 &lt;방수&gt; 공사");
    expect(text).toContain('href="https://www.g2b.go.kr/x?a=1&amp;b=2"');
    expect(text).not.toContain("<방수>");
  });

  it("javascript: 같은 주소는 링크로 만들지 않는다", () => {
    const t = buildMorningTelegram("2026-11-18", "2026-11-19", [], [notice({ detail_url: "javascript:alert(1)" })], []).join("");
    expect(t).not.toContain("javascript:");
  });

  it("금액은 강의료가 아니라 공고 추정가격만", () => {
    expect(text).toContain("추정 120,000,000원");
  });
});

describe("splitMessage", () => {
  it("한 메시지 한도를 넘으면 나눈다", () => {
    const parts = splitMessage(Array.from({ length: 50 }, (_, i) => `줄 ${i} ${"가".repeat(100)}`), 1000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 1000)).toBe(true);
    expect(parts.join("\n").split("\n")).toHaveLength(50);
  });
});

describe("reminderMessage", () => {
  it("일정 알림", () => {
    expect(reminderMessage("1시간 뒤 일정", "14:00 원가 <특강>", "/lectures/abc")).toBe(
      '⏰ <b>1시간 뒤 일정</b>\n14:00 원가 &lt;특강&gt;\n<a href="https://work-erp-one.vercel.app/lectures/abc">ERP에서 보기</a>',
    );
    expect(tgEscape("a&b")).toBe("a&amp;b");
  });
});
