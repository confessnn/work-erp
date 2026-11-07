import type { Lecture } from "./types";

type Row = Pick<Lecture, "id" | "lecture_date" | "is_paid" | "expected_net">;

/** 달력에서 고른 날짜들의 미수령 일정과 예상 수령액 합계 */
export function unpaidOnDates<T extends Row>(lectures: T[], dates: Iterable<string>) {
  const set = new Set(dates);
  const rows = lectures.filter((l) => set.has(l.lecture_date) && !l.is_paid);
  return { ids: rows.map((l) => l.id), total: rows.reduce((s, l) => s + Number(l.expected_net), 0) };
}

/** "2026-11-14" 목록 → "11/14, 11/21" (날짜순) */
export function datesLabel(dates: Iterable<string>) {
  return [...dates]
    .sort()
    .map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`)
    .join(", ");
}
