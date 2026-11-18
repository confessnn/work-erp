import { describe, expect, it } from "vitest";
import { addedReply, overlapReply, parseCallback, toQuickEvent, weekdayOf, whenLabel, type Parsed } from "./quick-add";

const base: Parsed = { is_event: true, person: "dad", title: "치과", date: "2026-11-19", start_time: "15:00", end_time: null, memo: null };
const today = "2026-11-18";

describe("toQuickEvent", () => {
  it("정상 일정", () => {
    expect(toQuickEvent(base, today)).toEqual({ ok: true, event: { person: "dad", title: "치과", date: "2026-11-19", start: "15:00", end: null, memo: null } });
  });
  it("날짜가 없으면 오늘, 이상한 시간은 종일", () => {
    const r = toQuickEvent({ ...base, date: null, start_time: "25:00", end_time: "26:00" }, today);
    expect(r).toMatchObject({ ok: true, event: { date: today, start: null, end: null } });
  });
  it("끝 시간이 시작보다 앞이면 버린다", () => {
    expect(toQuickEvent({ ...base, end_time: "14:00" }, today)).toMatchObject({ ok: true, event: { end: null } });
    expect(toQuickEvent({ ...base, end_time: "16:30" }, today)).toMatchObject({ ok: true, event: { end: "16:30" } });
  });
  it("일정이 아니거나 날짜가 이상하면 거절", () => {
    expect(toQuickEvent({ ...base, is_event: false }, today).ok).toBe(false);
    expect(toQuickEvent({ ...base, date: "2026-02-30" }, today).ok).toBe(false);
    expect(toQuickEvent({ ...base, date: "2029-01-01" }, today).ok).toBe(false);
    expect(toQuickEvent({ ...base, title: "  " }, today).ok).toBe(false);
  });
});

describe("표시", () => {
  it("요일과 시간", () => {
    expect(weekdayOf("2026-11-19")).toBe("목");
    expect(whenLabel({ date: "2026-11-19", start: "15:00", end: "16:00" })).toBe("11월 19일(목) 15:00~16:00");
    expect(whenLabel({ date: "2026-12-24", start: null, end: null })).toBe("12월 24일(목) (종일)");
  });
  it("답장에 되돌리기 버튼", () => {
    const r = addedReply({ person: "baby", title: "예방<접종>", date: "2026-11-19", start: "10:00", end: null, memo: null }, "11111111-2222-3333-4444-555555555555");
    expect(r.html).toContain("예방&lt;접종&gt;");
    expect(r.html).toContain("아기 · 가족 달력");
    expect(r.buttons[0]).toEqual({ text: "되돌리기", callback_data: "undo:11111111-2222-3333-4444-555555555555" });
  });
});

describe("시간 겹침 묻기", () => {
  const ev = { person: "dad" as const, title: "치과 <예약>", date: "2026-11-20", start: "15:00", end: null, memo: null };
  const id = "12345678-1234-1234-1234-123456789abc";
  it("overlapReply", () => {
    const r = overlapReply(ev, id, ["14:30~16:00 특강 (강의)"]);
    expect(r.html).toContain("넣으려는 일정: 11월 20일(금) 15:00 치과 &lt;예약&gt; (아빠)");
    expect(r.html).toContain("· 14:30~16:00 특강 (강의)");
    expect(r.buttons).toEqual([
      { text: "그래도 넣기", callback_data: `add:${id}` },
      { text: "넣지 않기", callback_data: `skip:${id}` },
    ]);
    expect(`add:${id}`.length).toBeLessThanOrEqual(64);
  });
  it("parseCallback", () => {
    expect(parseCallback(`skip:${id}`)).toEqual({ kind: "skip", id });
    expect(parseCallback(`undo:${id}`)).toEqual({ kind: "undo", id });
    expect(parseCallback("add:nope")).toBeNull();
    expect(parseCallback(undefined)).toBeNull();
  });
});
