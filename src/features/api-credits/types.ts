export type ApiProvider = "anthropic" | "openai";
export type ReloadMode = "add" | "to";

export const PROVIDERS: { key: ApiProvider; label: string }[] = [
  { key: "anthropic", label: "Claude API" },
  { key: "openai", label: "OpenAI API" },
];

/** 달러 금액은 센트 단위 */
export type CreditSettings = {
  provider: ApiProvider;
  base_balance_cents: number | null;
  base_date: string | null;
  base_day_cost_cents: number;
  reload_threshold_cents: number | null;
  reload_amount_cents: number | null;
  reload_mode: ReloadMode;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

export type DailyUsage = { day: string; cost_cents: number; tokens: number | null };
