"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { fetchDailyUsage } from "./fetch-usage";
import { parseCents } from "./forecast";
import { PROVIDERS, type ApiProvider, type ReloadMode } from "./types";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "알 수 없는 오류");

/** 사용량을 받아 저장한다. 키가 없으면 건너뛴다. 실패해도 이전 값은 그대로 둔다 */
async function syncProvider(supabase: SupabaseClient, userId: string, provider: ApiProvider) {
  let error: string | null = null;
  let synced = false;
  try {
    const rows = await fetchDailyUsage(provider);
    if (rows) {
      if (rows.length) {
        const { error: e } = await supabase
          .from("api_usage_daily")
          .upsert(rows.map((r) => ({ ...r, provider, user_id: userId })), { onConflict: "user_id,provider,day" });
        if (e) throw new Error(e.message);
      }
      synced = true;
    }
  } catch (e) {
    error = errorText(e);
  }
  const { error: e2 } = await supabase.from("api_credit_settings").upsert(
    { user_id: userId, provider, last_sync_error: error, ...(synced ? { last_synced_at: new Date().toISOString() } : {}) },
    { onConflict: "user_id,provider" },
  );
  if (e2) throw new Error(e2.message);
}

/** '지금 갱신' 버튼. 처음 누르면 설정 행이 생겨 매일 자동 갱신도 시작된다 */
export async function refreshCredits() {
  const { supabase, userId } = await requireUser();
  await Promise.all(PROVIDERS.map((p) => syncProvider(supabase, userId, p.key)));
  revalidatePath("/");
}

export type CreditForm = { balance: string; threshold: string; amount: string; mode: ReloadMode };

/** 설정 저장. 잔액을 새로 넣으면 지금을 기준으로 다시 계산한다 */
export async function saveCreditSettings(provider: ApiProvider, form: CreditForm): Promise<{ error?: string }> {
  const { supabase, userId } = await requireUser();
  try {
    const balance = parseCents(form.balance, "현재 잔액");
    const threshold = parseCents(form.threshold, "충전 기준");
    const amount = parseCents(form.amount, "충전 금액");
    if (amount === 0) throw new Error("충전 금액은 0보다 커야 합니다.");

    const base: Record<string, unknown> = {};
    if (balance !== null) {
      // 입력 전에 쓴 금액이 다시 빠지지 않도록 오늘 사용액을 먼저 받아 둔다
      await syncProvider(supabase, userId, provider);
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("api_usage_daily").select("cost_cents").eq("provider", provider).eq("day", today).maybeSingle();
      Object.assign(base, { base_balance_cents: balance, base_date: today, base_day_cost_cents: Number(data?.cost_cents ?? 0) });
    }

    const { error } = await supabase.from("api_credit_settings").upsert(
      { user_id: userId, provider, reload_threshold_cents: threshold, reload_amount_cents: amount, reload_mode: form.mode, ...base },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error(error.message);
  } catch (e) {
    return { error: errorText(e) };
  }
  revalidatePath("/");
  return {};
}
