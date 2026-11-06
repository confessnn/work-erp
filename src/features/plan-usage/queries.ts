import "server-only";
import { requireUser } from "@/lib/supabase/server";
import type { PlanUsage } from "./types";

const number = (v: unknown) => (v === null ? null : Number(v));

export async function listPlanUsage(): Promise<PlanUsage[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("plan_usage").select("*");
  if (error) throw new Error(error.message);
  // numeric은 문자열로 올 수 있어 숫자로 맞춘다
  return ((data ?? []) as PlanUsage[]).map((u) => ({
    ...u,
    five_hour_percent: number(u.five_hour_percent),
    weekly_percent: number(u.weekly_percent),
    credits_balance: number(u.credits_balance),
  }));
}
