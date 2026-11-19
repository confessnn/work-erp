"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";
import { addDays, cleanTitle, TODO_COLUMNS, type Todo } from "./todos";

type Result = { ok: true; todo?: Todo } | { ok: false; message: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function addTodo(raw: string, day?: string): Promise<Result> {
  const title = cleanTitle(raw);
  if (!title) return { ok: false, message: "할 일을 적어 주세요." };
  const due = day && DAY.test(day) ? day : todayInSeoul();
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("todos")
    .insert({ title, due_date: due })
    .select(TODO_COLUMNS)
    .single();
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  revalidatePath("/");
  return { ok: true, todo: data as Todo };
}

export async function setTodoDone(id: string, done: boolean): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  return { ok: true };
}

/** 내일로 미루기 */
export async function postponeTodo(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").update({ due_date: addDays(todayInSeoul(), 1), done_at: null }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  return { ok: true };
}

/** 직접 적은 할 일은 지우고, 일정에서 불러온 할 일은 다시 불러오지 않도록 지운 표시만 한다 */
export async function deleteTodo(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const [hidden, removed] = await Promise.all([
    supabase.from("todos").update({ dismissed_at: new Date().toISOString() }).eq("id", id).not("source_kind", "is", null),
    supabase.from("todos").delete().eq("id", id).is("source_kind", null),
  ]);
  const error = hidden.error ?? removed.error;
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  return { ok: true };
}
