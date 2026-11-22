import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { BABY_TODO_COLUMNS, type BabyTodo } from "./baby-todos";
import { LINK_COLUMNS, type BabyLink } from "./links";
import { LOG_COLUMNS, seoulDayRange, type BabyLog, type CareKind } from "./care";

/**
 * 하루치 기록. 자정을 넘긴 잠도 요약에 들어가도록 전날 시작한 기록까지 읽는다.
 * 가족(나·아내) 기록이 함께 보인다 (DB 정책 baby_logs_select_family).
 */
export async function listCareDay(day: string): Promise<BabyLog[]> {
  const { supabase } = await requireUser();
  const { start, end } = seoulDayRange(day);
  const from = new Date(Date.parse(start) - 24 * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("baby_logs")
    .select(LOG_COLUMNS)
    .gte("started_at", from)
    .lt("started_at", end)
    .order("started_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as BabyLog[];
}

async function last(kinds: CareKind[]): Promise<BabyLog | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("baby_logs")
    .select(LOG_COLUMNS)
    .in("kind", kinds)
    .lte("started_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BabyLog | null) ?? null;
}

/** 마지막 기저귀·수유·잠 (날짜와 상관없이 가장 최근) */
export async function getLatestCare() {
  const [diaper, feed, sleep] = await Promise.all([last(["diaper"]), last(["formula", "breast", "pumped"]), last(["sleep"])]);
  return { diaper, feed, sleep };
}

/** 키·몸무게 기록 전부 (오래된 것부터) */
export async function listMeasurements(): Promise<BabyLog[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("baby_logs")
    .select(LOG_COLUMNS)
    .eq("kind", "weight")
    .order("started_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as BabyLog[];
}

/** 가장 최근 몸무게(kg). 키만 잰 기록은 건너뛴다 */
export async function latestWeightKg(): Promise<{ kg: number; at: string } | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("baby_logs")
    .select("value, started_at")
    .eq("kind", "weight")
    .not("value", "is", null)
    .lte("started_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { kg: Number(data.value), at: data.started_at as string } : null;
}

/** 최근 n일(오늘 포함) 수유 기록 (분유·유축수유·모유) */
export async function listRecentFeeds(today: string, n: number): Promise<BabyLog[]> {
  const { supabase } = await requireUser();
  const { start } = seoulDayRange(today);
  const from = new Date(Date.parse(start) - (n - 1) * 24 * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("baby_logs")
    .select(LOG_COLUMNS)
    .in("kind", ["formula", "pumped", "breast"])
    .gte("started_at", from)
    .order("started_at", { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as BabyLog[];
}

/** from~to(한국 날짜, 둘 다 포함) 기록. 자정을 넘긴 잠이 들어가도록 하루 앞부터 읽는다 */
export async function listCareRange(from: string, to: string): Promise<BabyLog[]> {
  const { supabase } = await requireUser();
  const start = new Date(Date.parse(seoulDayRange(from).start) - 24 * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("baby_logs")
    .select(LOG_COLUMNS)
    .gte("started_at", start)
    .lt("started_at", seoulDayRange(to).end)
    .order("started_at", { ascending: true })
    .limit(3000);
  if (error) throw new Error(error.message);
  return (data ?? []) as BabyLog[];
}

/** 아기 할 일 화면: 안 끝낸 것 전부 + 최근 14일 안에 끝낸 것 */
export async function listBabyTodos(today: string): Promise<BabyTodo[]> {
  const { supabase } = await requireUser();
  const since = new Date(Date.parse(seoulDayRange(today).start) - 14 * 24 * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("baby_todos")
    .select(BABY_TODO_COLUMNS)
    .or(`done_at.is.null,done_at.gte.${since}`)
    .order("due_date")
    .order("created_at")
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as BabyTodo[];
}

/** 대시보드·할 일 화면에 같이 보일 아기 할 일: 밀린 것(30일)~앞으로 7일, 안 끝냈거나 오늘 끝낸 것. 못 읽어도 빈 목록 */
export async function listBabyTodosForWidget(today: string): Promise<BabyTodo[]> {
  const { supabase } = await requireUser();
  const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 24 * 3_600_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("baby_todos")
    .select(BABY_TODO_COLUMNS)
    .gte("due_date", day(-30))
    .lte("due_date", day(7))
    .or(`done_at.is.null,done_at.gte.${seoulDayRange(today).start}`)
    .order("due_date")
    .order("created_at")
    .limit(100);
  if (error) {
    console.error("아기 할 일 불러오기 실패:", error.message);
    return [];
  }
  const rows = (data ?? []) as BabyTodo[];
  return [...rows.filter((t) => !t.done_at), ...rows.filter((t) => t.done_at)];
}

/** 아기 링크 (최근에 넣은 것부터) */
export async function listBabyLinks(): Promise<BabyLink[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("baby_links").select(LINK_COLUMNS).order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as BabyLink[];
}
