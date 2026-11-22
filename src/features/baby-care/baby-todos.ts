// 아기 할 일 (supabase/migrations/20261122100000_baby_todos.sql). 가족(나·아내) 공용 한 건이라
// 누가 고치거나 완료해도 둘 다 같은 것을 본다.

export type BabyTodo = {
  id: string;
  title: string;
  due_date: string; // YYYY-MM-DD (서울)
  note: string | null;
  done_at: string | null;
  done_by: string | null;
  updated_by: string | null;
  updated_at: string;
};

export const BABY_TODO_COLUMNS = "id, title, due_date, note, done_at, done_by, updated_by, updated_at";

export type BabyTodoGroups = { late: BabyTodo[]; today: BabyTodo[]; later: BabyTodo[]; done: BabyTodo[] };

/** 화면 묶음: 밀린 것 / 오늘 / 앞으로 / 끝낸 것(최근 먼저) */
export function groupBabyTodos(rows: BabyTodo[], today: string): BabyTodoGroups {
  const open = rows.filter((t) => !t.done_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return {
    late: open.filter((t) => t.due_date < today),
    today: open.filter((t) => t.due_date === today),
    later: open.filter((t) => t.due_date > today),
    done: rows.filter((t) => t.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!)),
  };
}
