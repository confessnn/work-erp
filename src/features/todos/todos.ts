// 할 일 (supabase/migrations/20261119040000_todos.sql)

export type Todo = {
  id: string;
  title: string;
  due_date: string; // YYYY-MM-DD (서울)
  done_at: string | null;
  created_at: string;
};

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
