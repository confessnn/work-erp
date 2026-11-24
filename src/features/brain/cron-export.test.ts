import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./service", () => ({}));
vi.mock("@/features/google-calendar/crypto", () => ({}));
vi.mock("@/features/google-calendar/google-api", () => ({}));
vi.mock("./drive", () => ({}));

const { recordEntries } = await import("./cron-export");

describe("recordEntries", () => {
  it("강의·가족 일정 기록을 기록 묶기용으로, 빈 기록은 뺀다", () => {
    const out = recordEntries({
      lectures: [
        { id: "l1", title: "재경관리사 2회차", organization: "서울시청", lecture_date: "2026-11-20", start_time: "09:00:00", record: "진도" },
        { id: "l2", title: "빈 기록", organization: null, lecture_date: "2026-11-21", start_time: null, record: "  " },
      ],
      family: [{ id: "f1", title: "보건소", event_date: "2026-11-19", start_time: null, record: "접종" }],
    });
    expect(out).toEqual([
      { kind: "lecture", id: "l1", title: "재경관리사 2회차", organization: "서울시청", date: "2026-11-20", start_time: "09:00:00", record: "진도" },
      { kind: "family", id: "f1", title: "보건소", organization: null, date: "2026-11-19", start_time: null, record: "접종" },
    ]);
  });
});
