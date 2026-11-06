import type { DailyUsage, ReloadMode } from "./types";

const DAY_MS = 86_400_000;
/** 추세를 보는 기간. 집계 중인 오늘은 뺀다 */
const TREND_DAYS = 7;
/** 사용한 날이 이보다 적으면 추세로 보지 않는다 */
const MIN_ACTIVE_DAYS = 2;

export type ForecastInput = {
  today: string;
  usage: DailyUsage[];
  baseBalance: number | null;
  baseDate: string | null;
  baseDayCost: number;
  threshold: number | null;
  reloadAmount: number | null;
  reloadMode: ReloadMode;
};

export type Forecast = {
  /** 예상 잔액. 기준 잔액을 넣지 않았으면 null */
  balance: number | null;
  /** 기준일 이후 일어났을 것으로 계산한 자동 충전 */
  reloads: number;
  reloadedTotal: number;
  monthCost: number;
  monthTokens: number | null;
  /** 최근 7일 하루 평균 */
  dailyAverage: number;
  activeDays: number;
  /** 다음 충전까지 남은 일수와 날짜. 추세가 부족하거나 설정이 없으면 null */
  daysLeft: number | null;
  nextReloadDate: string | null;
  nextReloadAmount: number | null;
};

/** "$5" "5.25" → 센트. 비었으면 null, 잘못된 값이면 throw */
export function parseCents(value: string, label: string) {
  const text = value.replace(/[$,\s]/g, "");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label}을(를) 달러 금액으로 넣어 주세요.`);
  return Math.round(n * 100);
}

const addDays =(day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** 충전 후 잔액. 'to'는 정해진 잔액까지 채우므로 이미 그보다 많으면 그대로다 */
function reloaded(balance: number, amount: number, mode: ReloadMode) {
  return mode === "add" ? balance + amount : Math.max(balance, amount);
}

/** 충전해도 기준 아래에 머무는 설정이면 충전이 끝없이 반복되므로 계산에서 뺀다 */
function canReload(threshold: number | null, amount: number | null, mode: ReloadMode): amount is number {
  return threshold !== null && amount !== null && amount > 0 && (mode === "add" || amount >= threshold);
}

function estimateBalance({ today, usage, baseBalance, baseDate, baseDayCost, threshold, reloadAmount, reloadMode }: ForecastInput) {
  if (baseBalance === null || baseDate === null) return { balance: null, reloads: 0, reloadedTotal: 0 };

  let balance = baseBalance;
  let reloads = 0;
  let reloadedTotal = 0;
  const days = usage.filter((u) => u.day >= baseDate && u.day <= today).sort((a, b) => a.day.localeCompare(b.day));
  for (const u of days) {
    balance -= u.day === baseDate ? Math.max(0, u.cost_cents - baseDayCost) : u.cost_cents;
    while (canReload(threshold, reloadAmount, reloadMode) && balance < (threshold as number)) {
      const after = reloaded(balance, reloadAmount, reloadMode);
      reloadedTotal += after - balance;
      balance = after;
      reloads++;
    }
  }
  return { balance, reloads, reloadedTotal };
}

/** 잔액·이번 달 사용액·다음 자동 충전 시점 */
export function forecast(input: ForecastInput): Forecast {
  const { today, usage, threshold, reloadAmount, reloadMode } = input;
  const { balance, reloads, reloadedTotal } = estimateBalance(input);

  const month = usage.filter((u) => u.day.slice(0, 7) === today.slice(0, 7));
  const monthCost = month.reduce((sum, u) => sum + u.cost_cents, 0);
  const tokens = month.flatMap((u) => (u.tokens === null ? [] : [u.tokens]));
  const monthTokens = tokens.length ? tokens.reduce((sum, t) => sum + t, 0) : null;

  const from = addDays(today, -TREND_DAYS);
  const recent = usage.filter((u) => u.day >= from && u.day < today);
  const dailyAverage = recent.reduce((sum, u) => sum + u.cost_cents, 0) / TREND_DAYS;
  const activeDays = recent.filter((u) => u.cost_cents > 0).length;

  let daysLeft: number | null = null;
  let nextReloadDate: string | null = null;
  let nextReloadAmount: number | null = null;
  if (balance !== null && activeDays >= MIN_ACTIVE_DAYS && canReload(threshold, reloadAmount, reloadMode)) {
    daysLeft = Math.max(0, Math.ceil((balance - (threshold as number)) / dailyAverage));
    nextReloadDate = addDays(today, daysLeft);
    nextReloadAmount = reloadMode === "add" ? reloadAmount : Math.max(0, reloadAmount - (threshold as number));
  }

  return { balance, reloads, reloadedTotal, monthCost, monthTokens, dailyAverage, activeDays, daysLeft, nextReloadDate, nextReloadAmount };
}
