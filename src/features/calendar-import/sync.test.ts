import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./ics";
import { eventToRow, matchesKeyword, selectNewEvents } from "./sync";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  uid: "u1",
  title: "원가계산 특강",
  location: "OO대학교",
  date: "2026-11-10",
  start: "14:00",
  end: "16:00",
  allDay: false,
  ...over,
});

describe("matchesKeyword", () => {
  it("비우면 전부", () => expect(matchesKeyword(ev({}), null)).toBe(true));
  it("쉼표로 여러 개, 제목·장소 검색", () => {
    expect(matchesKeyword(ev({}), "세미나, 특강")).toBe(true);
    expect(matchesKeyword(ev({ title: "치과" }), "강의, 특강")).toBe(false);
    expect(matchesKeyword(ev({ title: "출강" }), "대학교")).toBe(true);
  });
});

describe("selectNewEvents", () => {
  it("이미 있거나 삭제한 일정 제외", () => {
    const list = [ev({ uid: "a" }), ev({ uid: "b" }), ev({ uid: "c", title: "가족 모임", location: null })];
    expect(selectNewEvents(list, "특강", new Set(["a"])).map((e) => e.uid)).toEqual(["b"]);
  });
});

describe("eventToRow", () => {
  it("시간 × 시간당 강의료 + 원천징수", () => {
    const row = eventToRow(ev({}), {
      hourly_rate: 300_000,
      income_type: "business",
      apply_tax_exemption: true,
      org_from_location: true,
    });
    expect(row).toMatchObject({
      external_uid: "u1",
      hours: 2,
      gross_amount: 600_000,
      income_tax: 18_000,
      local_tax: 1_800,
      expected_net: 580_200,
      organization: "OO대학교",
    });
  });

  it("종일 일정은 0시간 0원 (나중에 직접 수정)", () => {
    const row = eventToRow(ev({ start: null, end: null, allDay: true }), {
      hourly_rate: 300_000,
      income_type: "other",
      apply_tax_exemption: true,
      org_from_location: false,
    });
    expect(row).toMatchObject({ hours: 0, gross_amount: 0, expected_net: 0, organization: null });
  });
});
