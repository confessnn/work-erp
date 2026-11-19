import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { addDays, recordTarget, seoulDayStart, todayList, TODO_COLUMNS, withRecords, type Todo } from "./todos";

/**
 * 대시보드 '오늘 할 일' (최근 30일 안의 밀린 할 일까지).
 * 먼저 오늘 일정과 그 메모 줄을 할 일로 불러온다 (DB 함수 sync_schedule_todos, 여러 번 불러도 한 번만 생긴다).
 */
export async function listTodayTodos(today: string): Promise<Todo[]> {
  const { supabase } = await requireUser();
  // 불러오기가 실패해도 직접 적은 할 일은 보여 준다
  await supabase.rpc("sync_schedule_todos", { p_day: today }).then(({ error }) => {
    if (error) console.error("일정 할 일 불러오기 실패:", error.message);
  });
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_COLUMNS)
    .is("dismissed_at", null)
    .gte("due_date", addDays(today, -30))
    .lte("due_date", today)
    .or(`done_at.is.null,done_at.gte.${seoulDayStart(today)},due_date.eq.${today}`)
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = todayList((data ?? []) as Todo[], today);
  return withRecords(rows, await loadRecords(supabase, rows), new Date());
}

/** 일정 할 일이 가리키는 강의·가족 일정의 기록. 못 읽어도 할 일 목록은 보여 준다 */
async function loadRecords(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], rows: Todo[]) {
  const ids = { lecture: [] as string[], family: [] as string[] };
  for (const t of rows) {
    const target = recordTarget(t);
    if (target) ids[target.kind].push(target.id);
  }
  const records = new Map<string, string | null>();
  const [lectures, family] = await Promise.all([
    ids.lecture.length ? supabase.from("lectures").select("id, record").in("id", ids.lecture) : null,
    ids.family.length ? supabase.from("family_events").select("id, record").in("id", ids.family) : null,
  ]);
  for (const [kind, res] of [["lecture", lectures], ["family", family]] as const) {
    if (res?.error) console.error("일정 기록 불러오기 실패:", res.error.message);
    for (const r of res?.data ?? []) records.set(`${kind}:${r.id}`, r.record);
  }
  return records;
}
