import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { listRecordEntries } from "@/features/records/queries";
import { addDays, recordTarget, seoulDayStart, todayList, TODO_COLUMNS, withPrevious, withRecords, type SharedTodo, type Todo } from "./todos";

/**
 * 대시보드 '오늘 할 일' (최근 30일 안의 밀린 할 일까지).
 * 먼저 오늘 일정과 그 메모 줄을 할 일로 불러온다 (DB 함수 sync_schedule_todos, 여러 번 불러도 한 번만 생긴다).
 */
export async function listTodayTodos(today: string): Promise<Todo[]> {
  const { supabase, userId } = await requireUser();
  // 불러오기가 실패해도 직접 적은 할 일은 보여 준다
  await supabase.rpc("sync_schedule_todos", { p_day: today }).then(({ error }) => {
    if (error) console.error("일정 할 일 불러오기 실패:", error.message);
  });
  const { data, error } = await supabase
    .from("todos")
    .select(TODO_COLUMNS)
    // 가족이 공유한 할 일도 읽을 수 있으므로 내 것만 (공유받은 것은 listSharedTodos)
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .gte("due_date", addDays(today, -30))
    .lte("due_date", today)
    .or(`done_at.is.null,done_at.gte.${seoulDayStart(today)},due_date.eq.${today}`)
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = todayList((data ?? []) as Todo[], today);
  const { records, titles } = await loadRecords(supabase, rows);
  const withRec = withRecords(rows, records, new Date());
  if (titles.size === 0) return withRec;
  // 지난 회차 기록은 덤이라, 못 읽어도 할 일 목록은 보여 준다
  const entries = await listRecordEntries(supabase).catch((e) => {
    console.error("지난 기록 불러오기 실패:", e instanceof Error ? e.message : e);
    return [];
  });
  return withPrevious(withRec, titles, entries, today);
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
    ids.lecture.length ? supabase.from("lectures").select("id, title, record").in("id", ids.lecture) : null,
    ids.family.length ? supabase.from("family_events").select("id, title, record").in("id", ids.family) : null,
  ]);
  const titles = new Map<string, string>();
  for (const [kind, res] of [["lecture", lectures], ["family", family]] as const) {
    if (res?.error) console.error("일정 기록 불러오기 실패:", res.error.message);
    for (const r of res?.data ?? []) {
      records.set(`${kind}:${r.id}`, r.record);
      titles.set(`${kind}:${r.id}`, r.title);
    }
  }
  return { records, titles };
}

/**
 * 가족이 나에게 공유한 할 일: 밀린 것(30일)부터 앞으로 7일까지, 안 끝냈거나 오늘 끝낸 것.
 * 볼 수 있는 범위는 DB 정책(todos_select_shared)이 정한다.
 */
export async function listSharedTodos(today: string): Promise<SharedTodo[]> {
  const { supabase, userId } = await requireUser();
  const [{ data, error }, { data: members }] = await Promise.all([
    supabase
      .from("todos")
      .select("id, title, due_date, done_at, note, user_id")
      .eq("shared", true)
      .neq("user_id", userId)
      .is("dismissed_at", null)
      .gte("due_date", addDays(today, -30))
      .lte("due_date", addDays(today, 7))
      .or(`done_at.is.null,done_at.gte.${seoulDayStart(today)}`)
      .order("due_date")
      .order("created_at")
      .limit(100),
    // 가족을 만든 사람이면 초대한 가족의 이름(예: 아내)을 붙인다
    supabase.from("family_members").select("member_id, label").eq("owner_id", userId),
  ]);
  if (error) {
    console.error("공유받은 할 일 불러오기 실패:", error.message);
    return [];
  }
  const label = new Map((members ?? []).map((m) => [m.member_id as string, m.label as string]));
  const rows = (data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    due_date: t.due_date as string,
    done_at: t.done_at as string | null,
    note: t.note as string | null,
    who: label.get(t.user_id as string) ?? "가족",
  }));
  return [...rows.filter((t) => !t.done_at), ...rows.filter((t) => t.done_at)];
}

/** 할 일을 공유할 가족이 있는지 (초대받은 가족이거나, 가족을 초대한 사람) */
export async function hasFamilyPartner(): Promise<boolean> {
  const { supabase, userId } = await requireUser();
  const { count } = await supabase
    .from("family_members")
    .select("member_id", { count: "exact", head: true })
    .or(`owner_id.eq.${userId},member_id.eq.${userId}`);
  return (count ?? 0) > 0;
}
