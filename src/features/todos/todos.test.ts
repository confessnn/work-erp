import { expect, it } from "vitest";
import { addDays, cleanTitle, progress, seoulDayStart, sourceLabel, todayList, type Todo } from "./todos";

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
