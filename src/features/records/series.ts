// 일정 기록(lectures.record / family_events.record)을 '같은 일'끼리 묶는 순수 함수들

export type RecordKind = "lecture" | "family";

/** 기록이 있는 일정 하나 */
export type RecordEntry = {
  kind: RecordKind;
  id: string;
  title: string;
  organization: string | null;
  date: string; // YYYY-MM-DD
  start_time: string | null;
  record: string;
};

/** 같은 일 묶음 */
export type Series = {
  key: string;
  /** 가장 최근 회차의 제목 */
  name: string;
  /** 최근 회차가 앞 */
  entries: RecordEntry[];
};

// 회차 표시: "3회차", "제2회", "4차시", "2주차", "5강", "(3)", "[3]", "#3"
const SESSION_MARK = /제?\d+\s*(?:회차|차시|주차|일차|회|차|강)(?![가-힣])|[([]\s*\d+\s*[)\]]|#\d+/g;

/**
 * 같은 일로 묶는 열쇠: 회차 표시를 떼고, 띄어쓰기·대소문자를 무시한다.
 * "재경관리사 2회차" = "재경관리사(3)" = "재경관리사"
 */
export function seriesKey(title: string): string {
  const plain = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return plain(title.replace(SESSION_MARK, "")) || plain(title);
}

const newestFirst = (a: RecordEntry, b: RecordEntry) =>
  b.date.localeCompare(a.date) || (b.start_time ?? "").localeCompare(a.start_time ?? "");

/** 같은 일끼리 묶는다. 최근에 기록한 묶음이 앞 */
export function groupSeries(entries: RecordEntry[]): Series[] {
  const map = new Map<string, RecordEntry[]>();
  for (const e of entries) {
    const k = seriesKey(e.title);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const sorted = [...list].sort(newestFirst);
      return { key, name: sorted[0].title, entries: sorted };
    })
    .sort((a, b) => newestFirst(a.entries[0], b.entries[0]));
}

/** 이 일정보다 앞선 같은 일의 가장 최근 기록 (오늘 회차 자신은 뺀다) */
export function previousRecord(entries: RecordEntry[], title: string, before: string, exceptId?: string): RecordEntry | null {
  const key = seriesKey(title);
  return (
    entries
      .filter((e) => e.id !== exceptId && e.date < before && seriesKey(e.title) === key)
      .sort(newestFirst)[0] ?? null
  );
}

/** 제목·기관·기록 내용으로 찾기 (띄어쓰기·대소문자 무시) */
export function matchesQuery(e: RecordEntry, q: string): boolean {
  const needle = q.replace(/\s+/g, "").toLowerCase();
  if (!needle) return true;
  return [e.title, e.organization ?? "", e.record].some((s) => s.replace(/\s+/g, "").toLowerCase().includes(needle));
}

const KIND_LABEL: Record<RecordKind, string> = { lecture: "강의", family: "가족 일정" };

/** 엑셀에서 바로 열리는 CSV (한글이 깨지지 않게 BOM을 붙인다) */
export function toCsv(entries: RecordEntry[]): string {
  const cell = (v: string | null) => {
    const s = v ?? "";
    // 수식으로 읽히지 않게 막고, 따옴표·쉼표·줄바꿈이 있으면 감싼다
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  const rows = [
    ["날짜", "시간", "구분", "제목", "기관", "기록"],
    ...[...entries].sort(newestFirst).map((e) => [e.date, e.start_time?.slice(0, 5) ?? "", KIND_LABEL[e.kind], e.title, e.organization, e.record]),
  ];
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** 기록을 고치러 갈 화면 */
export const editHref = (e: Pick<RecordEntry, "kind" | "id">) => (e.kind === "lecture" ? `/lectures/${e.id}` : `/family/${e.id}`);
