import { describe, expect, it } from "vitest";
import type { FamilyEvent, FamilyLecture } from "@/features/family/types";
import { addDays, groupByDate, restOfMonth, selectedDate, weekOf, widgetItems, widgetRange, yearMonthOf } from "./items";

const lecture = (p: Partial<FamilyLecture>): FamilyLecture => ({
  id: "l1",
  title: "강의",
  organization: null,
  lecture_date: "2026-11-10",
  start_time: null,
  end_time: null,
  ...p,
});

const event = (p: Partial<FamilyEvent>): FamilyEvent => ({
  id: "e1",
  family_id: "f",
  person: "mom",
  title: "병원",
  event_date: "2026-11-10",
  start_time: null,
  end_time: null,
  memo: null,
  record: null,
  created_by: null,
  updated_at: "2026-11-01T00:00:00Z",
  external_uid: null,
  source_id: null,
  ...p,
});

describe("widgetItems", () => {
  it("날짜 → 종일 먼저 → 시작 시간순으로 정렬한다", () => {
    const items = widgetItems(
      [event({ id: "e1", event_date: "2026-11-10", start_time: "09:00:00" })],
      [
        lecture({ id: "l1", lecture_date: "2026-11-12", start_time: "13:00:00" }),
        lecture({ id: "l2", lecture_date: "2026-11-10", start_time: null }),
        lecture({ id: "l3", lecture_date: "2026-11-10", start_time: "14:00:00" }),
      ],
    );
    expect(items.map((i) => i.key)).toEqual(["lecture-l2", "event-e1", "lecture-l3", "lecture-l1"]);
  });

  it("금액으로 쓸 수 있는 칸을 만들지 않는다 (제목·시간·사람만)", () => {
    const [it0] = widgetItems([], [lecture({})]);
    expect(Object.keys(it0).sort()).toEqual(["cls", "date", "end", "key", "kind", "start", "title", "who"]);
  });

  it("사람별 색과 이름은 가족 달력과 같게 붙인다", () => {
    const [lec, mom] = widgetItems([event({ person: "mom" })], [lecture({})]);
    expect(mom.who).toBe("엄마");
    expect(mom.cls).not.toBe(lec.cls);
    expect(lec.who).toBe("강의");
  });
});

describe("groupByDate", () => {
  it("같은 날 일정을 한 칸으로 모은다", () => {
    const g = groupByDate(widgetItems([event({ id: "e1" })], [lecture({ id: "l1" }), lecture({ id: "l2", lecture_date: "2026-11-11" })]));
    expect(g.get("2026-11-10")?.length).toBe(2);
    expect(g.get("2026-11-11")?.length).toBe(1);
    expect(g.get("2026-11-12")).toBeUndefined();
  });
});

describe("addDays", () => {
  it("달·해를 넘어가도 맞다", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // 윤년
    expect(addDays("2026-11-26", 0)).toBe("2026-11-26");
  });
});

describe("weekOf", () => {
  it("일요일로 시작하는 7일을 준다", () => {
    expect(weekOf("2026-11-26")).toEqual([
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
    ]);
  });

  it("일요일을 주면 그 주를 그대로 준다", () => {
    expect(weekOf("2026-11-22")[0]).toBe("2026-11-22");
  });

  it("달을 걸친 주도 앞뒤 달 날짜를 그대로 준다", () => {
    expect(weekOf("2026-12-01")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
  });
});

describe("yearMonthOf", () => {
  it("연·월을 숫자로 준다", () => {
    expect(yearMonthOf("2026-01-05")).toEqual({ year: 2026, month: 1 });
  });
});

describe("selectedDate", () => {
  it("그달 안의 바른 날짜는 그대로 쓴다", () => {
    expect(selectedDate("2026-11-15", 2026, 11, "2026-11-26")).toBe("2026-11-15");
  });

  it("보고 있는 달과 다르면 무시한다", () => {
    expect(selectedDate("2026-10-15", 2026, 11, "2026-11-26")).toBe("2026-11-26");
  });

  it("이상한 값은 무시한다", () => {
    for (const bad of [undefined, "", "오늘", "2026-11-31", "20261115", "2026-11-15'"]) {
      expect(selectedDate(bad, 2026, 11, "2026-11-26")).toBe("2026-11-26");
    }
  });

  it("보고 있는 달에 오늘이 없으면 1일을 고른다", () => {
    expect(selectedDate(undefined, 2026, 12, "2026-11-26")).toBe("2026-12-01");
  });
});

describe("widgetRange", () => {
  it("그달에 겹치는 주를 통째로 준다 (월 경계 날짜도 일정 점이 찍히게)", () => {
    // 2026-11-01 은 일요일, 말일 11-30(월)이 든 주는 12-05(토)까지
    expect(widgetRange(2026, 11)).toEqual({ start: "2026-11-01", next: "2026-12-06" });
  });

  it("해를 걸쳐도 맞다", () => {
    // 12-01(화)이 든 주는 11-29(일)부터, 말일 12-31(목)이 든 주는 2027-01-02(토)까지
    expect(widgetRange(2026, 12)).toEqual({ start: "2026-11-29", next: "2027-01-03" });
  });

  it("준 기간은 주간 띠에 보이는 날짜를 모두 덮는다", () => {
    const { start, next } = widgetRange(2026, 12);
    for (const day of ["2026-12-01", "2026-12-31"]) {
      for (const date of weekOf(day)) {
        expect(date >= start && date < next).toBe(true);
      }
    }
  });
});

describe("restOfMonth", () => {
  const items = widgetItems(
    [
      event({ id: "e0", event_date: "2026-11-29" }),
      event({ id: "e1", event_date: "2026-12-01" }),
    ],
    [
      lecture({ id: "l1", lecture_date: "2026-12-10" }),
      lecture({ id: "l2", lecture_date: "2026-12-20" }),
    ],
  );

  it("고른 날 뒤의 일정만 준다", () => {
    expect(restOfMonth(items, "2026-12-10", 2026, 12).map((i) => i.key)).toEqual(["lecture-l2"]);
  });

  it("앞뒤 달 일정은 빼고 보고 있는 달만 준다", () => {
    expect(restOfMonth(items, "2026-11-01", 2026, 11).map((i) => i.key)).toEqual(["event-e0"]);
  });
});
