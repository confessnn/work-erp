import { describe, expect, it } from "vitest";
import { editHref, groupSeries, matchesQuery, previousRecord, seriesKey, toCsv, type RecordEntry } from "./series";

const e = (id: string, title: string, date: string, record = `${id} 기록`, extra: Partial<RecordEntry> = {}): RecordEntry => ({
  kind: "lecture",
  id,
  title,
  organization: null,
  date,
  start_time: null,
  record,
  ...extra,
});

describe("seriesKey", () => {
  it("회차 표시·띄어쓰기·대소문자를 무시한다", () => {
    const k = seriesKey("재경관리사");
    expect(seriesKey("재경관리사 2회차")).toBe(k);
    expect(seriesKey("재경관리사(3)")).toBe(k);
    expect(seriesKey("제4회 재경관리사")).toBe(k);
    expect(seriesKey("재경 관리사 5강")).toBe(k);
    expect(seriesKey("백석대 ITQ(ZOOM)")).toBe(seriesKey("백석대 itq (zoom) 3차시"));
  });
  it("회차가 아닌 숫자·낱말은 그대로 둔다", () => {
    expect(seriesKey("회계관리 1급")).not.toBe(seriesKey("회계관리 2급"));
    expect(seriesKey("2회계 특강")).toBe("2회계특강");
    expect(seriesKey("3회")).toBe("3회");
  });
});

describe("groupSeries / previousRecord", () => {
  const list = [
    e("a1", "재경관리사 1회차", "2026-11-01"),
    e("b1", "FAT 기출문제 촬영", "2026-11-10"),
    e("a2", "재경관리사 2회차", "2026-11-08"),
    e("a3", "재경관리사", "2026-11-21"),
  ];

  it("같은 일끼리 묶고 최근 것이 앞", () => {
    const g = groupSeries(list);
    expect(g.map((s) => [s.name, s.entries.map((x) => x.id)])).toEqual([
      ["재경관리사", ["a3", "a2", "a1"]],
      ["FAT 기출문제 촬영", ["b1"]],
    ]);
  });

  it("그날보다 앞선 같은 일의 가장 최근 기록", () => {
    expect(previousRecord(list, "재경관리사 3회차", "2026-11-21", "a3")?.id).toBe("a2");
    expect(previousRecord(list, "재경관리사", "2026-11-01")).toBeNull();
    expect(previousRecord(list, "백석대 ITQ(ZOOM)", "2026-11-21")).toBeNull();
  });
});

it("matchesQuery: 제목·기관·기록에서 찾는다", () => {
  const x = e("1", "도고 켐코인재원", "2026-11-19", "녹음 잘 됨", { organization: "켐코" });
  expect(matchesQuery(x, "")).toBe(true);
  expect(matchesQuery(x, "켐 코")).toBe(true);
  expect(matchesQuery(x, "녹음")).toBe(true);
  expect(matchesQuery(x, "재경")).toBe(false);
});

it("toCsv: BOM, 따옴표·줄바꿈 감싸기, 수식 막기", () => {
  const csv = toCsv([
    e("1", '"특강", 1부', "2026-11-19", "3장까지\n다음엔 4장", { start_time: "08:00:00", organization: "켐코" }),
    e("2", "병원", "2026-11-20", "=1+1", { kind: "family" }),
  ]);
  expect(csv.startsWith("﻿날짜,시간,구분,제목,기관,기록\r\n")).toBe(true);
  expect(csv).toContain('2026-11-20,,가족 일정,병원,,\'=1+1\r\n');
  expect(csv).toContain('2026-11-19,08:00,강의,"""특강"", 1부",켐코,"3장까지\n다음엔 4장"\r\n');
});

it("editHref", () => {
  expect(editHref({ kind: "lecture", id: "x" })).toBe("/lectures/x");
  expect(editHref({ kind: "family", id: "y" })).toBe("/family/y");
});
