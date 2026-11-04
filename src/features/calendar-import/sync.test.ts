import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./ics";
import { eventToRow, findDuplicate, isOwnErpEvent, matchesKeyword, planImport, type ExistingLecture } from "./sync";

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

const erp = (over: Partial<ExistingLecture>): ExistingLecture => ({
  id: "L1",
  lecture_date: "2026-11-10",
  start_time: "14:00:00",
  title: "원가 특강",
  external_uid: null,
  ...over,
});

describe("findDuplicate", () => {
  it("같은 날짜 + 같은 시작 시각이면 제목이 달라도 같은 강의", () => {
    expect(findDuplicate(ev({ title: "OO대 원가계산" }), [erp({})])?.id).toBe("L1");
  });
  it("시작 시각이 다르면 다른 강의", () => {
    expect(findDuplicate(ev({ start: "15:00" }), [erp({})])).toBeNull();
  });
  it("종일 일정은 같은 날짜 + 같은 제목일 때만", () => {
    const allDay = ev({ start: null, end: null, allDay: true, title: "워크숍 " });
    expect(findDuplicate(allDay, [erp({ start_time: null, title: "워크숍" })])?.id).toBe("L1");
    expect(findDuplicate(allDay, [erp({ start_time: null, title: "다른 일" })])).toBeNull();
    expect(findDuplicate(allDay, [erp({})])).toBeNull();
  });
});

describe("isOwnErpEvent", () => {
  it("ERP가 내보낸 일정 구분", () => {
    expect(isOwnErpEvent("erp3f2504e04f8911d39a0c0305e82c3301@google.com")).toBe(true);
    expect(isOwnErpEvent("lec-1@work-erp")).toBe(true);
    expect(isOwnErpEvent("abc123@google.com")).toBe(false);
    expect(isOwnErpEvent("error-report@google.com")).toBe(false);
  });
});

describe("planImport", () => {
  it("이미 불러온·삭제한 일정과 키워드 불일치 제외", () => {
    const list = [ev({ uid: "a" }), ev({ uid: "b", start: "09:00" }), ev({ uid: "c", title: "가족 모임", location: null, start: "18:00" })];
    const plan = planImport(list, "특강", new Set(["a"]), []);
    expect(plan.newEvents.map((e) => e.uid)).toEqual(["b"]);
  });

  it("ERP에 같은 강의가 있으면 새로 만들지 않고 연결", () => {
    const plan = planImport([ev({ uid: "g1" })], null, new Set(), [erp({})]);
    expect(plan.newEvents).toEqual([]);
    expect(plan.links).toEqual([{ lecture_id: "L1", external_uid: "g1" }]);
  });

  it("이미 다른 구글 일정과 연결된 ERP 일정이면 건너뜀", () => {
    const plan = planImport([ev({ uid: "g2" })], null, new Set(), [erp({ external_uid: "g1" })]);
    expect(plan).toEqual({ newEvents: [], links: [] });
  });

  it("ERP가 내보낸 일정은 다시 불러오지 않음", () => {
    const plan = planImport([ev({ uid: "erp3f2504e04f8911d39a0c0305e82c3301@google.com" })], null, new Set(), []);
    expect(plan.newEvents).toEqual([]);
  });

  it("같은 캘린더에 똑같은 일정이 두 개여도 하나만", () => {
    const plan = planImport([ev({ uid: "x1" }), ev({ uid: "x2" })], null, new Set(), []);
    expect(plan.newEvents.map((e) => e.uid)).toEqual(["x1"]);
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
