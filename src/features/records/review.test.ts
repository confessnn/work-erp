import { expect, it } from "vitest";
import { MAX_REVIEW_ENTRIES, reviewInput } from "./review";
import type { RecordEntry, Series } from "./series";

const entry = (i: number): RecordEntry => ({
  kind: "lecture",
  id: String(i),
  title: `재경관리사 ${i}회차`,
  organization: null,
  date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
  start_time: null,
  record: `기록 ${i}`,
});

it("reviewInput: 최근 회차만, 오래된 것부터", () => {
  // 최근 것이 앞에 오는 묶음
  const series: Series = { key: "k", name: "재경관리사", entries: Array.from({ length: 40 }, (_, i) => entry(39 - i)) };
  const text = reviewInput(series);
  expect(text).toContain(`회차 ${MAX_REVIEW_ENTRIES}개`);
  expect(text).not.toContain("기록 9\n");
  expect(text.indexOf("기록 10\n")).toBeLessThan(text.indexOf("기록 39\n"));
});
