import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DATA_DIR = join(homedir(), ".work-erp");

/** ERP로 보낸다. 토큰은 이 PC의 설정 파일에만 있고 화면에 출력하지 않는다 */
export async function report(provider, usage, timeoutMs) {
  const { supabaseUrl, publishableKey, token } = JSON.parse(readFileSync(join(DATA_DIR, "plan-usage.json"), "utf8"));
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/report_plan_usage`, {
    method: "POST",
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_token: token,
      p_provider: provider,
      p_plan: usage.plan,
      p_five_hour_percent: usage.fiveHourPercent,
      p_five_hour_resets_at: usage.fiveHourResetsAt,
      p_weekly_percent: usage.weeklyPercent,
      p_weekly_resets_at: usage.weeklyResetsAt,
      p_credits_balance: usage.creditsBalance,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`ERP 저장 실패 (${res.status})`);
}
