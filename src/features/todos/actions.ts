"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";
import { addDays, cleanTitle, type Todo } from "./todos";

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
    .select("id, title, due_date, done_at, created_at")
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

export async function deleteTodo(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  return { ok: true };
}
