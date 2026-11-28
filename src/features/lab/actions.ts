"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { ROSTER } from "./roster";
import { cleanInstruction, TASK_COLUMNS, type LabTask, type TaskState } from "./tasks";

type Result = { ok: true; task?: LabTask } | { ok: false; message: string };

const KNOWN = new Set(ROSTER.map((r) => r.id));
const STATES: TaskState[] = ["queued", "running", "review", "done"];

/** 연구원에게 일을 맡긴다. 실제 작업은 맥에서 도는 워커가 가져가서 한다 */
export async function assignTask(researcher: string, raw: string): Promise<Result> {
  if (!KNOWN.has(researcher)) return { ok: false, message: "그런 연구원이 없어요." };
  const title = cleanInstruction(raw);
  if (!title) return { ok: false, message: "맡길 일을 적어 주세요." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("lab_tasks")
    .insert({ researcher, title })
    .select(TASK_COLUMNS)
    .single();
  if (error) return { ok: false, message: `맡기지 못했어요: ${error.message}` };
  revalidatePath("/lab");
  revalidatePath("/");
  return { ok: true, task: data as LabTask };
}

/** 보드에서 칸을 옮긴다 (사람이 직접 옮길 때. 연구원은 DB를 바로 고친다) */
export async function setTaskState(id: string, state: TaskState): Promise<Result> {
  if (!STATES.includes(state)) return { ok: false, message: "모르는 상태예요." };
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { state, updated_at: now };
  if (state === "running") patch.started_at = now;
  if (state === "done") patch.finished_at = now;
  if (state === "queued") {
    patch.started_at = null;
    patch.finished_at = null;
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("lab_tasks").update(patch).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/lab");
  revalidatePath("/");
  return { ok: true };
}

/** 맡긴 일을 지운다 */
export async function deleteTask(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("lab_tasks").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/lab");
  revalidatePath("/");
  return { ok: true };
}
