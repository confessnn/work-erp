"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { cleanNote, cleanTitle } from "@/features/todos/todos";
import { BABY_TODO_COLUMNS, type BabyTodo } from "./baby-todos";

// 아기 할 일 쓰기. 가족(나·아내) 누구나 만들고 고치고 완료하고 지운다 (DB 정책 baby_todos_*_family).

type Result = { ok: true; todo?: BabyTodo } | { ok: false; message: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/todos");
  revalidatePath("/baby/todos");
};

export type BabyTodoInput = { title: string; due_date: string; note?: string | null };

function clean(input: BabyTodoInput) {
  const title = cleanTitle(input.title ?? "");
  if (!title) return { error: "할 일을 적어 주세요." } as const;
  if (!DAY.test(input.due_date ?? "")) return { error: "날짜를 골라 주세요." } as const;
  return { row: { title, due_date: input.due_date, note: cleanNote(input.note ?? "") } } as const;
}

export async function addBabyTodo(input: BabyTodoInput): Promise<Result> {
  const c = clean(input);
  if ("error" in c) return { ok: false, message: c.error ?? "확인해 주세요." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("baby_todos").insert(c.row).select(BABY_TODO_COLUMNS).single();
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  refresh();
  return { ok: true, todo: data as BabyTodo };
}

export async function updateBabyTodo(id: string, input: BabyTodoInput): Promise<Result> {
  const c = clean(input);
  if ("error" in c) return { ok: false, message: c.error ?? "확인해 주세요." };
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("baby_todos")
    .update({ ...c.row, updated_by: userId })
    .eq("id", id)
    .select(BABY_TODO_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  if (!data) return { ok: false, message: "지워졌거나 찾을 수 없는 할 일이에요." };
  refresh();
  return { ok: true, todo: data as BabyTodo };
}

/** 완료·되돌리기: 한 사람이 체크하면 가족 모두에게 완료로 보인다 */
export async function setBabyTodoDone(id: string, done: boolean): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("baby_todos")
    .update({ done_at: done ? new Date().toISOString() : null, done_by: done ? userId : null, updated_by: userId })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "지워졌거나 찾을 수 없는 할 일이에요." };
  refresh();
  return { ok: true };
}

export async function deleteBabyTodo(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("baby_todos").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true };
}
