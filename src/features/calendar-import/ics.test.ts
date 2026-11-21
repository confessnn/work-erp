import { describe, expect, it } from "vitest";
import { normalizeIcsUrl, occurrenceKey, parseIcs } from "./ics";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:test
BEGIN:VTIMEZONE
TZID:Asia/Seoul
BEGIN:STANDARD
TZOFFSETFROM:+0900
TZOFFSETTO:+0900
TZNAME:KST
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:single-1
SUMMARY:원가계산 특강
LOCATION:OO대학교
DTSTART;TZID=Asia/Seoul:20261110T140000
DTEND;TZID=Asia/Seoul:20261110T170000
END:VEVENT
BEGIN:VEVENT
UID:utc-1
SUMMARY:UTC 강의
DTSTART:20261111T010000Z
DTEND:20261111T030000Z
END:VEVENT
BEGIN:VEVENT
UID:allday-1
SUMMARY:종일 워크숍
DTSTART;VALUE=DATE:20261112
DTEND;VALUE=DATE:20261113
END:VEVENT
BEGIN:VEVENT
UID:weekly-1
SUMMARY:주간 강의
DTSTART;TZID=Asia/Seoul:20261102T090000
DTEND;TZID=Asia/Seoul:20261102T120000
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
BEGIN:VEVENT
UID:weekly-1
RECURRENCE-ID;TZID=Asia/Seoul:20261109T090000
SUMMARY:주간 강의 (시간 변경)
DTSTART;TZID=Asia/Seoul:20261109T130000
DTEND;TZID=Asia/Seoul:20261109T150000
END:VEVENT
BEGIN:VEVENT
UID:cancel-1
SUMMARY:취소된 강의
STATUS:CANCELLED
DTSTART;TZID=Asia/Seoul:20261113T090000
DTEND;TZID=Asia/Seoul:20261113T100000
END:VEVENT
BEGIN:VEVENT
UID:old-1
SUMMARY:지난 강의
DTSTART;TZID=Asia/Seoul:20250101T090000
DTEND;TZID=Asia/Seoul:20250101T100000
END:VEVENT
END:VCALENDAR`;

describe("parseIcs", () => {
  const events = parseIcs(ICS, "2026-11-01", "2026-11-30");
  const byTitle = (t: string) => events.find((e) => e.title === t);

  it("시간대 있는 일정", () => {
    expect(byTitle("원가계산 특강")).toMatchObject({
      uid: "single-1",
      date: "2026-11-10",
      start: "14:00",
      end: "17:00",
      location: "OO대학교",
      allDay: false,
    });
  });

  it("UTC 일정은 한국 시간으로 변환", () => {
    expect(byTitle("UTC 강의")).toMatchObject({ date: "2026-11-11", start: "10:00", end: "12:00" });
  });

  it("종일 일정", () => {
    expect(byTitle("종일 워크숍")).toMatchObject({ date: "2026-11-12", start: null, allDay: true });
  });

  it("반복 일정은 회차별로 펼치고 수정된 회차 반영", () => {
    const weekly = events.filter((e) => e.uid.startsWith("weekly-1#"));
    expect(weekly.map((e) => e.date)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
    const changed = weekly.find((e) => e.date === "2026-11-09");
    expect(changed).toMatchObject({ title: "주간 강의 (시간 변경)", start: "13:00", end: "15:00" });
    expect(weekly.map((e) => e.uid)).toEqual([
      "weekly-1#2026-11-02",
      "weekly-1#2026-11-09",
      "weekly-1#2026-11-16",
      "weekly-1#2026-11-23",
    ]);
  });

  it("반복 일정 전체 시간을 바꿔도 회차 ID는 그대로 (날짜만 사용)", () => {
    const moved = parseIcs(ICS.replace(/T090000/g, "T093000").replace(/T120000/g, "T123000"), "2026-11-01", "2026-11-30");
    const weekly = moved.filter((e) => e.uid.startsWith("weekly-1#"));
    expect(weekly.map((e) => e.uid)).toEqual(events.filter((e) => e.uid.startsWith("weekly-1#")).map((e) => e.uid));
    expect(weekly.find((e) => e.date === "2026-11-16")).toMatchObject({ start: "09:30", end: "12:30" });
  });

  it("취소·범위 밖 일정 제외", () => {
    expect(byTitle("취소된 강의")).toBeUndefined();
    expect(byTitle("지난 강의")).toBeUndefined();
  });

  it("날짜순 정렬", () => {
    const keys = events.map((e) => e.date + (e.start ?? ""));
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("occurrenceKey", () => {
  it("새 형식·단일 일정은 그대로", () => {
    expect(occurrenceKey("a@google.com#2026-12-01")).toBe("a@google.com#2026-12-01");
    expect(occurrenceKey("single-1")).toBe("single-1");
  });
  it("옛 형식(회차 시각 포함)은 날짜만", () => {
    expect(occurrenceKey("a@google.com#2026-12-01T17:30:00")).toBe("a@google.com#2026-12-01");
    expect(occurrenceKey("a@google.com#2026-12-01")).toBe(occurrenceKey("a@google.com#2026-12-01T18:00:00"));
  });
  it("옛 UTC 형식은 한국 날짜로", () => {
    expect(occurrenceKey("a#2026-11-30T16:00:00Z")).toBe("a#2026-12-01");
    expect(occurrenceKey("a#2026-11-30T14:00:00Z")).toBe("a#2026-11-30");
  });
  it("구글 '이 일정 및 향후 일정' 분할(_R...)은 같은 반복으로", () => {
    expect(occurrenceKey("a_R20261201T083000@google.com#2026-12-08")).toBe("a@google.com#2026-12-08");
  });
});

describe("normalizeIcsUrl", () => {
  it("webcal → https, http 거부", () => {
    expect(normalizeIcsUrl("webcal://p01-caldav.icloud.com/x")).toBe("https://p01-caldav.icloud.com/x");
    expect(normalizeIcsUrl("http://example.com/a.ics")).toBeNull();
    expect(normalizeIcsUrl("아무거나")).toBeNull();
  });
});
