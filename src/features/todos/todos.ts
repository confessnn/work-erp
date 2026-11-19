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
};

/** DB에서 읽을 칸 */
export const TODO_COLUMNS = "id, title, due_date, done_at, created_at, source_key, source_title";

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
