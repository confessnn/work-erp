import { expect, it } from "vitest";
import { addDays, cleanRecord, cleanTitle, progress, recordTarget, seoulDayStart, sourceLabel, todayList, withPrevious, withRecords, type Todo } from "./todos";

const t = (id: string, due_date: string, done_at: string | null = null, created_at = "2026-11-10T00:00:00Z"): Todo => ({ id, title: id, due_date, done_at, created_at });

it("addDays / seoulDayStart", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  expect(seoulDayStart("2026-11-19")).toBe("2026-11-18T15:00:00.000Z");
});

it("todayList: 오늘 것 + 밀린 것, 안 한 것 먼저", () => {
  const today = "2026-11-19";
  const rows = [
    t("오늘-끝", today, "2026-11-19T01:00:00Z"),
    t("오늘", today),
    t("밀림", "2026-11-17"),
    t("어제-끝(어제)", "2026-11-18", "2026-11-18T05:00:00Z"),
    t("어제-끝(오늘)", "2026-11-18", "2026-11-19T00:30:00Z"),
    t("내일", "2026-11-20"),
  ];
  expect(todayList(rows, today).map((x) => x.id)).toEqual(["밀림", "오늘", "어제-끝(오늘)", "오늘-끝"]);
  expect(progress(todayList(rows, today))).toEqual({ done: 2, total: 4 });
});

it("cleanTitle", () => {
  expect(cleanTitle("  견적서   보내기 ")).toBe("견적서 보내기");
  expect(cleanTitle("   ")).toBeNull();
  expect(cleanTitle("가".repeat(300))?.length).toBe(200);
});

it("sourceLabel: 일정에서 불러온 할 일의 출처", () => {
  expect(sourceLabel({ source_key: null, source_title: null })).toBeNull();
  expect(sourceLabel({})).toBeNull();
  expect(sourceLabel({ source_key: "event", source_title: null })).toBe("일정");
  expect(sourceLabel({ source_key: "memo:녹음준비", source_title: "도고 켐코인재원" })).toBe("도고 켐코인재원 메모");
  expect(sourceLabel({ source_key: "memo:녹음준비", source_title: null })).toBe("일정 메모");
});

it("recordTarget: 일정 자체 할 일만 기록을 남긴다", () => {
  expect(recordTarget({ source_key: "event", source_kind: "lecture", source_id: "L1" })).toEqual({ kind: "lecture", id: "L1" });
  expect(recordTarget({ source_key: "memo:녹음준비", source_kind: "lecture", source_id: "L1" })).toBeNull();
  expect(recordTarget({ source_key: null, source_kind: null, source_id: null })).toBeNull();
});

it("withRecords: 일정 할 일에 기록과 끝났는지를 붙인다", () => {
  const now = new Date("2026-11-19T19:00:00+09:00");
  const ev = (id: string, kind: "lecture" | "family", end: string | null): Todo => ({
    ...t(id, "2026-11-19"),
    source_key: "event",
    source_kind: kind,
    source_id: `${id}-src`,
    source_end_at: end,
  });
  const rows = [
    ev("오전강의", "lecture", "2026-11-19T12:00:00+09:00"),
    ev("저녁강의", "lecture", "2026-11-19T20:30:00+09:00"),
    ev("병원", "family", null),
    { ...t("녹음준비", "2026-11-19"), source_key: "memo:녹음준비", source_kind: "lecture" as const, source_id: "오전강의-src" },
    t("직접", "2026-11-19"),
  ];
  const records = new Map([["lecture:오전강의-src", "3장까지 진행"]]);
  const out = withRecords(rows, records, now);
  expect(out.map((x) => [x.id, x.record ?? null, x.ended ?? null])).toEqual([
    ["오전강의", "3장까지 진행", true],
    ["저녁강의", null, false],
    ["병원", null, false],
    ["녹음준비", null, null],
    ["직접", null, null],
  ]);
});

it("cleanRecord", () => {
  expect(cleanRecord("  3장까지\r\n다음엔 4장  ")).toBe("3장까지\n다음엔 4장");
  expect(cleanRecord("   ")).toBeNull();
  expect(cleanRecord("가".repeat(2100))?.length).toBe(2000);
});

it("withPrevious: 같은 일의 지난 회차 기록을 붙인다", () => {
  const ev: Todo = { ...t("오늘강의", "2026-11-21"), source_key: "event", source_kind: "lecture", source_id: "L3" };
  const memo: Todo = { ...t("메모", "2026-11-21"), source_key: "memo:x", source_kind: "lecture", source_id: "L3" };
  const entry = (id: string, title: string, date: string) => ({ kind: "lecture" as const, id, title, organization: null, date, start_time: null, record: `${id} 기록` });
  const entries = [entry("L1", "재경관리사 1회차", "2026-11-14"), entry("L2", "재경관리사 2회차", "2026-11-17"), entry("L3", "재경관리사 3회차", "2026-11-21")];
  const titles = new Map([["lecture:L3", "재경관리사 3회차"]]);
  const [a, b] = withPrevious([ev, memo], titles, entries, "2026-11-21");
  expect(a.previous).toEqual({ date: "2026-11-17", title: "재경관리사 2회차", record: "L2 기록", series: "재경관리사" });
  expect(b.previous).toBeUndefined();
  expect(withPrevious([ev], new Map([["lecture:L3", "새 강의"]]), entries, "2026-11-21")[0].previous).toBeNull();
});
