import type { PlanUsage } from "../types";
import { reportedLabel, usageBar, type UsageBar } from "../view";

const LEVEL_CLASS: Record<UsageBar["level"], string> = {
  normal: "stroke-accent",
  warn: "stroke-warn",
  high: "stroke-red-500",
};

const SIZE = 56;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 한도 하나의 원그래프. 가운데 숫자와 아래 글자로 읽을 수 있어 색만으로 구분하지 않는다 */
function Donut({ bar }: { bar: UsageBar }) {
  const percent = Math.round(bar.percent);
  const description = `${bar.label} ${percent}% 사용${bar.reset ? `, ${bar.reset}` : ""}`;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center" title={description}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={description} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-line" />
          {percent > 0 && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${(bar.percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              className={LEVEL_CLASS[bar.level]}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">{percent}%</span>
      </div>
      <div className="text-xs font-medium">{bar.label}</div>
      {bar.reset && <div className="break-keep text-[11px] leading-tight text-muted">{bar.reset}</div>}
    </div>
  );
}

/** 구독 플랜의 5시간·주간 한도 위젯 */
export function PlanUsageCard({ title, hint, usage, now }: { title: string; hint: string; usage: PlanUsage | undefined; now: number }) {
  const bars = usage
    ? [
        usageBar("5시간", usage.five_hour_percent, usage.five_hour_resets_at, now, false),
        usageBar("주간", usage.weekly_percent, usage.weekly_resets_at, now, true),
      ].flatMap((b) => (b ? [b] : []))
    : [];

  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="text-sm font-semibold">
          {title}
          {usage?.plan && <span className="ml-1 font-normal text-muted">· {usage.plan}</span>}
        </h3>
        {usage && <span className="shrink-0 text-[11px] text-muted">{reportedLabel(usage.reported_at)}</span>}
      </div>

      {bars.length > 0 ? (
        <div className="flex items-start gap-2">
          {bars.map((b) => (
            <Donut key={b.label} bar={b} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">아직 받은 값이 없습니다. {hint}</p>
      )}

      {usage?.credits_balance != null && (
        <p className="text-[11px] text-muted">
          크레딧 잔량 <span className="tabular-nums">{usage.credits_balance.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</span>
        </p>
      )}
    </div>
  );
}
