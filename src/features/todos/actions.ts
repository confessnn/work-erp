"use server";

import { revalidatePath } from "next/cache";
import { schedulePush } from "@/features/google-calendar/push";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";
import { addDays, cleanNote, cleanRecord, cleanTitle, recordTarget, TODO_COLUMNS, type Todo } from "./todos";

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

/** 하루 미루기: 보고 있는 날(없으면 오늘)의 다음 날로 */
export async function postponeTodo(id: string, from?: string): Promise<Result> {
  const { supabase } = await requireUser();
  const base = from && DAY.test(from) && from > todayInSeoul() ? from : todayInSeoul();
  const { error } = await supabase.from("todos").update({ due_date: addDays(base, 1), done_at: null }).eq("id", id);
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

/** 일정에서 온 할 일에 기록 남기기: 기록은 그 일정(강의·가족 일정)의 '기록' 칸에 저장한다 */
export async function saveScheduleRecord(todoId: string, raw: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { data: todo, error: e1 } = await supabase.from("todos").select("source_key, source_kind, source_id").eq("id", todoId).maybeSingle();
  if (e1) return { ok: false, message: e1.message };
  const target = todo && recordTarget(todo as Pick<Todo, "source_key" | "source_kind" | "source_id">);
  if (!target) return { ok: false, message: "일정에서 온 할 일이 아니에요." };

  const record = cleanRecord(raw);
  const table = target.kind === "lecture" ? "lectures" : "family_events";
  const { data, error } = await supabase
    .from(table)
    .update({ record, updated_at: new Date().toISOString() })
    .eq("id", target.id)
    .select("id");
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  if (!data?.length) return { ok: false, message: "일정을 찾지 못했어요. 지워졌을 수 있어요." };
  // 강의를 고친 Server Action은 구글 캘린더 반영을 예약한다 (AGENTS.md)
  if (target.kind === "lecture") schedulePush(supabase);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 할 일 메모 저장 (비우면 지운다) */
export async function saveTodoNote(id: string, raw: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("todos").update({ note: cleanNote(raw) }).eq("id", id);
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  revalidatePath("/");
  return { ok: true };
}

/**
 * 다른 날의 할 일 (위젯에서 날짜를 넘길 때). 그날로 적어 둔 할 일만 보여 준다.
 * 일정에서 불러오는 할 일은 그날이 되면 자동으로 들어오므로 여기서는 미리 만들지 않는다.
 */
export async function listTodosOn(day: string): Promise<{ ok: true; todos: Todo[] } | { ok: false; message: string }> {
  if (!DAY.test(day)) return { ok: false, message: "날짜가 올바르지 않아요." };
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_COLUMNS)
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .eq("due_date", day)
    .order("created_at")
    .limit(200);
  if (error) return { ok: false, message: error.message };
  const rows = (data ?? []) as Todo[];
  return { ok: true, todos: [...rows.filter((t) => !t.done_at), ...rows.filter((t) => t.done_at)] };
}

/** 내 할 일을 가족에게 공유하거나 공유를 끈다 */
export async function setTodoShared(id: string, shared: boolean): Promise<Result> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("todos").update({ shared }).eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  revalidatePath("/todos");
  return { ok: true };
}

/** 가족이 공유한 할 일 완료 체크 (쓴 사람이 아니어도 체크만 가능) */
export async function setSharedTodoDone(id: string, done: boolean): Promise<Result> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("set_shared_todo_done", { p_id: id, p_done: done });
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "공유가 꺼졌거나 지워진 할 일이에요." };
  revalidatePath("/");
  revalidatePath("/todos");
  return { ok: true };
}
