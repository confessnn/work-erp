import "server-only";
import { requireUser } from "@/lib/supabase/server";
import type { ApiProvider, CreditSettings, DailyUsage } from "./types";

export async function getCreditData() {
  const { supabase } = await requireUser();
  const [settings, usage] = await Promise.all([
    supabase.from("api_credit_settings").select("*"),
    supabase.from("api_usage_daily").select("provider, day, cost_cents, tokens").order("day"),
  ]);
  if (settings.error) throw new Error(settings.error.message);
  if (usage.error) throw new Error(usage.error.message);

  const rows = (usage.data ?? []) as (DailyUsage & { provider: ApiProvider })[];
  return {
    settings: (settings.data ?? []) as CreditSettings[],
    // bigint·numeric은 문자열로 올 수 있어 숫자로 맞춘다
    usage: rows.map((u) => ({ ...u, cost_cents: Number(u.cost_cents), tokens: u.tokens === null ? null : Number(u.tokens) })),
  };
}
