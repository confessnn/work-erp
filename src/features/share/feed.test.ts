import { describe, expect, it } from "vitest";
import { parseIcs } from "@/features/calendar-import/ics";
import { buildIcsFeed, type SharedEvent } from "./feed";

const events: SharedEvent[] = [
  {
    id: "a1",
    title: "원가계산, 실무; 특강",
    organization: "OO대학교",
    lecture_date: "2026-11-10",
    start_time: "14:00:00",
    end_time: "17:00:00",
    updated_at: "2026-11-04T00:00:00Z",
  },
  {
    id: "b2",
    title: "종일 워크숍 ".repeat(20), // 긴 제목 → 줄 접기
    organization: null,
    lecture_date: "2026-11-30",
    start_time: null,
    end_time: null,
    updated_at: "2026-11-04T00:00:00Z",
  },
];

describe("buildIcsFeed", () => {
  const ics = buildIcsFeed(events);

  it("금액 관련 문자열이 없다", () => {
    expect(ics).not.toMatch(/원\b|강의료|amount|tax/i);
  });

  it("CRLF + 75바이트 줄 접기", () => {
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("다시 읽으면 같은 일정 (왕복 검증)", () => {
    const parsed = parseIcs(ics, "2026-11-01", "2026-12-31");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      uid: "a1@work-erp",
      title: "원가계산, 실무; 특강",
      location: "OO대학교",
      date: "2026-11-10",
      start: "14:00",
      end: "17:00",
    });
    expect(parsed[1]).toMatchObject({ date: "2026-11-30", allDay: true });
    expect(parsed[1].title).toBe(events[1].title.trim());
  });
});
