import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/features/calendar-import/ics";
import { importWindow, toImportRows } from "./import";

const e = (o: Partial<CalendarEvent>): CalendarEvent => ({
  uid: "u1",
  title: "병원",
  location: null,
  date: "2026-11-12",
  start: "10:00",
  end: "11:00",
  allDay: false,
  ...o,
});

describe("toImportRows", () => {
  it("시간 일정과 종일 일정", () => {
    expect(toImportRows([e({}), e({ uid: "u2", allDay: true, start: null, end: null, title: "" })])).toEqual([
      { external_uid: "u1", title: "병원", event_date: "2026-11-12", start_time: "10:00", end_time: "11:00" },
      { external_uid: "u2", title: "(제목 없음)", event_date: "2026-11-12", start_time: null, end_time: null },
    ]);
  });

  it("끝 시간이 시작보다 빠르면(자정 넘김) 끝 시간을 비운다", () => {
    expect(toImportRows([e({ start: "23:00", end: "01:00" })])[0].end_time).toBe(null);
  });

  it("ERP가 구글로 내보낸 강의 사본은 뺀다", () => {
    expect(toImportRows([e({ uid: `erp${"a".repeat(32)}@google.com` }), e({ uid: "x@work-erp" })])).toEqual([]);
  });
});

describe("importWindow", () => {
  it("30일 전부터 1년 뒤까지", () => {
    expect(importWindow("2026-11-07")).toEqual({ from: "2026-10-08", to: "2027-11-07" });
  });
});
