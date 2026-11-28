import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { TASK_COLUMNS, type LabTask } from "./tasks";

/**
 * 연구소 보드에 보여 줄 지시.
 * 끝난 일이 쌓여도 화면이 무거워지지 않도록 최근 것부터 limit 개만 읽는다.
 */
export async function listLabTasks(limit = 120): Promise<LabTask[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("lab_tasks")
    .select(TASK_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as LabTask[];
}

/**
 * 대시보드 위젯용. 연구소는 대시보드의 곁가지라, 여기서 실패해도 대시보드 전체가 죽지 않게 한다
 * (마이그레이션을 아직 적용하지 않았을 때도 대시보드는 떠야 한다).
 */
export async function listLabTasksForWidget(): Promise<LabTask[]> {
  try {
    return await listLabTasks(60);
  } catch {
    return [];
  }
}
