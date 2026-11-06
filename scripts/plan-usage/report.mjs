import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DATA_DIR = join(homedir(), ".work-erp");

/** ERP 함수 호출. 토큰은 이 PC의 설정 파일에만 있고 화면에 출력하지 않는다 */
async function rpc(name, params, timeoutMs) {
  const { supabaseUrl, publishableKey, token } = JSON.parse(readFileSync(join(DATA_DIR, "plan-usage.json"), "utf8"));
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: token, ...params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`ERP 호출 실패 (${res.status})`);
  return res;
}

/** ERP로 보낸다 */
export async function report(provider, usage, timeoutMs) {
  await rpc(
    "report_plan_usage",
    {
      p_provider: provider,
      p_plan: usage.plan,
      p_five_hour_percent: usage.fiveHourPercent,
      p_five_hour_resets_at: usage.fiveHourResetsAt,
      p_weekly_percent: usage.weeklyPercent,
      p_weekly_resets_at: usage.weeklyResetsAt,
      p_credits_balance: usage.creditsBalance,
    },
    timeoutMs,
  );
}

/** 화면에서 '지금 갱신'을 눌렀는지 확인한다. 확인한 요청은 지워진다 */
export async function takeRefreshRequest(timeoutMs) {
  const res = await rpc("take_plan_usage_refresh", {}, timeoutMs);
  return (await res.json()) === true;
}
