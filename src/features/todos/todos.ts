// 할 일 (supabase/migrations/20261119040000_todos.sql)

export type Todo = {
  id: string;
  title: string;
  due_date: string; // YYYY-MM-DD (서울)
  done_at: string | null;
  created_at: string;
  /** 일정에서 불러온 할 일: 'event' = 일정 자체, 'memo:…' = 메모 한 줄. 직접 적은 할 일은 null */
  source_key?: string | null;
  /** 메모 줄이 나온 일정 이름 */
  source_title?: string | null;
  source_kind?: ScheduleKind | null;
  source_id?: string | null;
  /** 일정이 끝나는 시각 (일정 자체 할 일만) */
  source_end_at?: string | null;
  /** 일정 자체 할 일: 그 일정에 남긴 기록 (lectures.record / family_events.record) */
  record?: string | null;
  /** 일정 자체 할 일: 끝나는 시각이 지났는지 (서버 시각 기준) */
  ended?: boolean;
};

export type ScheduleKind = "lecture" | "family";

/** DB에서 읽을 칸 */
export const TODO_COLUMNS = "id, title, due_date, done_at, created_at, source_key, source_title, source_kind, source_id, source_end_at";

export const RECORD_MAX = 2000;

/** 일정 자체에서 온 할 일이면 기록을 남길 일정 */
export function recordTarget(t: Pick<Todo, "source_key" | "source_kind" | "source_id">): { kind: ScheduleKind; id: string } | null {
  return t.source_key === "event" && t.source_kind && t.source_id ? { kind: t.source_kind, id: t.source_id } : null;
}

/** 일정 할 일에 기록과 '끝났는지'를 붙인다. records 키는 "lecture:<id>" / "family:<id>" */
export function withRecords(rows: Todo[], records: Map<string, string | null>, now: Date): Todo[] {
  return rows.map((t) => {
    const target = recordTarget(t);
    if (!target) return t;
    return {
      ...t,
      record: records.get(`${target.kind}:${target.id}`) ?? null,
      ended: !!t.source_end_at && Date.parse(t.source_end_at) <= now.getTime(),
    };
  });
}

/** 기록 입력 정리: 앞뒤 공백을 떼고 2000자까지. 비우면 null (기록 지우기) */
export function cleanRecord(raw: string): string | null {
  const t = raw.replace(/\r\n/g, "\n").trim();
  return t ? t.slice(0, RECORD_MAX) : null;
}

/** 할 일 옆에 작게 붙는 출처: 일정 자체는 '일정', 메모 줄은 '○○ 메모' */
export function sourceLabel(t: Pick<Todo, "source_key" | "source_title">): string | null {
  if (!t.source_key) return null;
  if (t.source_key === "event") return "일정";
  return t.source_title ? `${t.source_title} 메모` : "일정 메모";
}

/** "2026-11-19" 다음 날 */
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 서울 날짜 하루가 시작하는 시각 (UTC ISO) */
export const seoulDayStart = (day: string) => new Date(`${day}T00:00:00+09:00`).toISOString();

/**
 * 오늘 보여 줄 할 일: 오늘 것 + 지난 날 것 중 아직 안 한 것(밀린 할 일) + 오늘 끝낸 밀린 할 일.
 * 안 한 것을 위로, 밀린 것을 먼저, 같으면 넣은 순서.
 */
export function todayList(rows: Todo[], today: string): Todo[] {
  const start = seoulDayStart(today);
  return rows
    .filter((t) => t.due_date === today || (t.due_date < today && (!t.done_at || t.done_at >= start)))
    .sort(
      (a, b) =>
        Number(!!a.done_at) - Number(!!b.done_at) ||
        a.due_date.localeCompare(b.due_date) ||
        a.created_at.localeCompare(b.created_at),
    );
}

/** 위젯 머리의 "2/5" */
export function progress(list: Todo[]) {
  return { done: list.filter((t) => t.done_at).length, total: list.length };
}

/** 할 일 입력 검사 */
export function cleanTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 200) : null;
}
