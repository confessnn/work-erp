import "server-only";
import { requireUser } from "@/lib/supabase/server";
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
