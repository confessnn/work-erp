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
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">API 크레딧</h2>
        <RefreshButton />
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3">
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
    </section>
  );
}
