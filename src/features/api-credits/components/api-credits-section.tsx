import { ADMIN_KEY_ENV, hasAdminKey } from "../fetch-usage";
import { forecast } from "../forecast";
import { getCreditData } from "../queries";
import { PROVIDERS } from "../types";
import { CreditCard } from "./credit-card";
import { RefreshButton } from "./refresh-button";

/** 대시보드의 API 크레딧 요약 */
export async function ApiCreditsSection() {
  const { settings, usage } = await getCreditData();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">API 크레딧</h2>
        <RefreshButton />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {PROVIDERS.map((p) => {
          const s = settings.find((x) => x.provider === p.key);
          return (
            <CreditCard
              key={p.key}
              provider={p.key}
              label={p.label}
              keyName={ADMIN_KEY_ENV[p.key]}
              hasKey={hasAdminKey(p.key)}
              settings={s}
              forecast={forecast({
                today,
                usage: usage.filter((u) => u.provider === p.key),
                baseBalance: s?.base_balance_cents ?? null,
                baseDate: s?.base_date ?? null,
                baseDayCost: Number(s?.base_day_cost_cents ?? 0),
                threshold: s?.reload_threshold_cents ?? null,
                reloadAmount: s?.reload_amount_cents ?? null,
                reloadMode: s?.reload_mode ?? "add",
              })}
            />
          );
        })}
      </div>
      <p className="text-xs text-muted">
        잔액과 충전 시점은 입력값에서 사용액을 빼 계산한 추정치이며, 사용액은 UTC 날짜 기준입니다. Claude 사용액은 보통 4시간, 길면 24시간 늦게 반영됩니다. 실제 잔액과 다르면 다시 입력하세요.
      </p>
    </section>
  );
}
