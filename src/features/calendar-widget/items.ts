// 달력 위젯(/calendar/widget)에 보여 줄 일정 목록 만들기.
// 들어오는 자료는 가족 공유 범위(features/family/queries.ts의 listFamilyMonth)뿐이고,
// 그 범위에는 금액 칸이 아예 없다 (강의는 DB 함수 family_lecture_schedule가 제목·시간만 준다).
// 색·사람 이름은 가족 달력과 같은 곳(features/family/types.ts)에서 가져온다.

import { LECTURE_CLS, personOf, type FamilyEvent, type FamilyLecture } from "@/features/family/types";

/** 위젯 달력 한 칸에 들어가는 일정 한 건 */
export type WidgetItem = {
  /** 화면 목록 key (강의와 가족 일정의 id가 겹칠 일은 없지만 종류를 붙여 둔다) */
  key: string;
  kind: "lecture" | "event";
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM:SS
  end: string | null;
  title: string;
  /** 누구의 일정인지 ("강의", "엄마" …) */
  who: string;
  /** 색 클래스 (가족 달력과 같은 색) */
  cls: string;
};

/** 종일 일정이 맨 위, 그다음 시작 시간순 */
const timeOrder = (t: string | null) => (t ? t : "");

/** 가족 공유 범위의 강의·가족 일정을 한 목록으로 (날짜 → 종일 먼저 → 시작 시간) */
export function widgetItems(events: FamilyEvent[], lectures: FamilyLecture[]): WidgetItem[] {
  const items: WidgetItem[] = [
    ...lectures.map((l) => ({
      key: `lecture-${l.id}`,
      kind: "lecture" as const,
      date: l.lecture_date,
      start: l.start_time,
      end: l.end_time,
      title: l.title,
      who: "강의",
      cls: LECTURE_CLS,
    })),
    ...events.map((e) => ({
      key: `event-${e.id}`,
      kind: "event" as const,
      date: e.event_date,
      start: e.start_time,
      end: e.end_time,
      title: e.title,
      who: personOf(e.person).label,
      cls: personOf(e.person).cls,
    })),
  ];
  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      timeOrder(a.start).localeCompare(timeOrder(b.start)) ||
      a.title.localeCompare(b.title, "ko"),
  );
}

/** 날짜별로 모으기 (달력 칸에서 꺼내 쓴다) */
export function groupByDate(items: WidgetItem[]): Map<string, WidgetItem[]> {
  const out = new Map<string, WidgetItem[]>();
  for (const it of items) out.set(it.date, [...(out.get(it.date) ?? []), it]);
  return out;
}

/** "2026-11-26" + 3 → "2026-11-29" (달·해를 넘어가도 맞게) */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 그 날짜가 든 주(일요일 ~ 토요일) 7일 */
export function weekOf(date: string): string[] {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return Array.from({ length: 7 }, (_, i) => addDays(date, i - wd));
}

/** 날짜의 연·월 */
export function yearMonthOf(date: string) {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

/** 주소의 d= 값을 믿지 않고 확인한다. 없거나 틀렸으면 그달의 오늘, 오늘이 아니면 1일 */
export function selectedDate(raw: string | undefined, year: number, month: number, today: string): string {
  const mm = String(month).padStart(2, "0");
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw.startsWith(`${year}-${mm}-`)) {
    const { year: y, month: m } = yearMonthOf(raw);
    // 2월 30일 같은 없는 날짜는 되돌린다
    if (y === year && m === month && addDays(raw, 0) === raw) return raw;
  }
  return today.startsWith(`${year}-${mm}-`) ? today : `${year}-${mm}-01`;
}
