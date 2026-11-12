import { describe, expect, it } from "vitest";
import { monthRange, parseEventInput, safeNext } from "./form";

const input = (o: Record<string, string>) => (k: string) => o[k];

describe("parseEventInput", () => {
  it("시간 있는 일정", () => {
    const r = parseEventInput(input({ person: "mom", title: " 병원 ", event_date: "2026-11-12", start_time: "10:00", end_time: "11:30" }));
    expect(r).toEqual({
      ok: true,
      value: { person: "mom", title: "병원", event_date: "2026-11-12", start_time: "10:00", end_time: "11:30", memo: null },
    });
  });

  it("종일이면 시간을 비운다", () => {
    const r = parseEventInput(input({ person: "baby", title: "예방접종", event_date: "2026-11-12", start_time: "10:00", all_day: "on" }));
    expect(r.ok && r.value.start_time).toBe(null);
  });

  it("시작 없이 끝만 있으면 끝도 비운다", () => {
    const r = parseEventInput(input({ person: "all", title: "외식", event_date: "2026-11-12", end_time: "19:00" }));
    expect(r.ok && r.value.end_time).toBe(null);
  });

  it("잘못된 값은 이유를 돌려준다", () => {
    expect(parseEventInput(input({ person: "x", title: "a", event_date: "2026-11-12" }))).toEqual({ ok: false, error: "누구의 일정인지 골라 주세요." });
    expect(parseEventInput(input({ person: "dad", title: "", event_date: "2026-11-12" })).ok).toBe(false);
    expect(parseEventInput(input({ person: "dad", title: "a", event_date: "2026-13" })).ok).toBe(false);
    expect(parseEventInput(input({ person: "dad", title: "a", event_date: "2026-11-12", start_time: "10:00", end_time: "09:00" })).ok).toBe(false);
  });
});

describe("monthRange", () => {
  it("12월은 다음 해 1월까지", () => {
    expect(monthRange(2026, 12)).toEqual({ start: "2026-12-01", next: "2027-01-01" });
    expect(monthRange(2026, 3)).toEqual({ start: "2026-03-01", next: "2026-04-01" });
  });
});

describe("safeNext", () => {
  it("초대 수락 주소만 허용", () => {
    const t = "a".repeat(48);
    expect(safeNext(`/join/${t}`)).toBe(`/join/${t}`);
    expect(safeNext("https://evil.example")).toBe(null);
    expect(safeNext("//evil.example")).toBe(null);
    expect(safeNext(`/join/${t}/../x`)).toBe(null);
    expect(safeNext(`/join/bids/${t}`)).toBe(`/join/bids/${t}`);
    expect(safeNext(`/join/other/${t}`)).toBe(null);
  });
});
