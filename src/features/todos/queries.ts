import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { addDays, seoulDayStart, todayList, type Todo } from "./todos";

/** 대시보드 '오늘 할 일' (최근 30일 안의 밀린 할 일까지) */
export async function listTodayTodos(today: string): Promise<Todo[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("todos")
    .select("id, title, due_date, done_at, created_at")
    .gte("due_date", addDays(today, -30))
    .lte("due_date", today)
    .or(`done_at.is.null,done_at.gte.${seoulDayStart(today)},due_date.eq.${today}`)
    .limit(200);
  if (error) throw new Error(error.message);
  return todayList((data ?? []) as Todo[], today);
}
