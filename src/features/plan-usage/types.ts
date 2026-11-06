export type PlanProvider = "claude" | "codex";

export type PlanUsage = {
  provider: PlanProvider;
  plan: string | null;
  five_hour_percent: number | null;
  five_hour_resets_at: string | null;
  weekly_percent: number | null;
  weekly_resets_at: string | null;
  credits_balance: number | null;
  reported_at: string;
};
