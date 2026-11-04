import "server-only";
import { requireUser } from "@/lib/supabase/server";
import type { Lecture } from "./types";

export type Period = { year: number; month?: number };

function range({ year, month }: Period) {
  if (month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return { start, next };
  }
  return { start: `${year}-01-01`, next: `${year + 1}-01-01` };
}

export async function listLectures(
  period: Period,
  filters: { status?: "paid" | "unpaid"; incomeType?: "business" | "other"; organization?: string } = {},
): Promise<Lecture[]> {
  const { supabase } = await requireUser();
  const { start, next } = range(period);
  let q = supabase
    .from("lectures")
    .select("*")
    .gte("lecture_date", start)
    .lt("lecture_date", next)
    .order("lecture_date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true });

  if (filters.status) q = q.eq("is_paid", filters.status === "paid");
  if (filters.incomeType) q = q.eq("income_type", filters.incomeType);
  if (filters.organization) q = q.eq("organization", filters.organization);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Lecture[];
}

export async function getLecture(id: string): Promise<Lecture | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("lectures").select("*").eq("id", id).maybeSingle();
  return (data as Lecture | null) ?? null;
}

/** 입력 자동완성용: 지금까지 입력한 기관 목록 */
export async function listOrganizations(): Promise<string[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("lectures").select("organization").not("organization", "is", null);
  return [...new Set((data ?? []).map((r) => r.organization as string))].sort();
}

/** 오늘 이후 다가오는 일정 */
export async function listUpcoming(limit = 5): Promise<Lecture[]> {
  const { supabase } = await requireUser();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const { data } = await supabase
    .from("lectures")
    .select("*")
    .gte("lecture_date", today)
    .order("lecture_date", { ascending: true })
    .limit(limit);
  return (data ?? []) as Lecture[];
}
