// 원가 입찰가 계산. 비율은 모두 % 단위, 금액은 원 단위 정수.

/** negotiation = 협상에 의한 계약, qualified = 적격심사, price = 최저가·수의 등 가격 순 */
export type AwardMode = "negotiation" | "qualified" | "price";

export const guessAwardMode = (awardMethod: string | null): AwardMode =>
  /협상/.test(awardMethod ?? "") ? "negotiation" : /적격/.test(awardMethod ?? "") ? "qualified" : "price";

export type Staff = { label: string; people: number; months: number; monthlyPay: number };
export type CostInput = { staff: Staff[]; expenses: number; overheadRate: number; profitRate: number };

/** 인건비 + 경비 + 일반관리비 = 원가, 원가 + 이윤 = 공급가, 공급가 + 부가세 = 합계 */
export function calcCost({ staff, expenses, overheadRate, profitRate }: CostInput) {
  const labor = Math.round(staff.reduce((sum, s) => sum + s.people * s.months * s.monthlyPay, 0));
  const overhead = Math.round(((labor + expenses) * overheadRate) / 100);
  const cost = labor + expenses + overhead;
  const profit = Math.round((cost * profitRate) / 100);
  const supply = cost + profit;
  const vat = Math.round(supply * 0.1);
  return { labor, expenses, overhead, cost, profit, supply, vat, total: supply + vat };
}

/** "87.5, 88 / 90.1" → [87.5, 88, 90.1] (붙여 넣기 편하도록 구분자를 가리지 않는다) */
export function parseRates(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n > 0 && n <= 200);
}

/** 사분위수 (선형 보간) */
export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

export type Plan = { key: "attack" | "balanced" | "safe"; label: string; rate: number; price: number };

/** 협상·가격 순: 유사 낙찰률의 하위 25%·중앙값·상위 25% */
export function plansFromRates(base: number, rates: number[]): Plan[] {
  if (base <= 0 || rates.length === 0) return [];
  const plan = (key: Plan["key"], label: string, q: number): Plan => {
    const rate = quantile(rates, q);
    return { key, label, rate, price: Math.round((base * rate) / 100) };
  };
  return [plan("attack", "공격", 0.25), plan("balanced", "균형", 0.5), plan("safe", "보수", 0.75)];
}

/** 적격심사: 공격은 기준금액 × 하한율 × 1.003, 균형·보수는 그 위 0.5%p씩. 하한 미달을 피하려고 올림한다 */
export function plansFromLowerRate(base: number, lowerRate: number): Plan[] {
  if (base <= 0 || lowerRate <= 0) return [];
  const attack = lowerRate * 1.003;
  const plan = (key: Plan["key"], label: string, rate: number): Plan => ({ key, label, rate, price: Math.ceil((base * rate) / 100) });
  return [plan("attack", "공격", attack), plan("balanced", "균형", attack + 0.5), plan("safe", "보수", attack + 1)];
}

/**
 * 협상 가격점수 = 배점 × (최저입찰가 ÷ 당해입찰가). 최저입찰가가 추정가격의 하한 비율 미만이면 하한으로 본다.
 * 실제 산식은 공고문 평가기준이 우선한다.
 */
export function priceScore(price: number, lowest: number, estimate: number, weight: number, floorRate: number) {
  if (price <= 0) return { score: 0, loss: weight };
  const reference = Math.max(lowest, (estimate * floorRate) / 100);
  const score = weight * Math.min(1, reference / price);
  return { score, loss: weight - score };
}

/** 예정가격이 기준금액 ±range% 안에서 정해질 때, 각 경우에 낙찰하한을 넘는지 */
export function clearsLowerBound(price: number, base: number, lowerRate: number, range: number) {
  const bound = (shift: number) => (base * (1 + shift / 100) * lowerRate) / 100;
  return { low: price >= bound(-range), mid: price >= bound(0), high: price >= bound(range) };
}

/** 같은 기준(부가세 포함/별도)으로 맞춘 금액 */
export function vatPair(price: number, includesVat: boolean) {
  return includesVat ? { excl: Math.round(price / 1.1), incl: price } : { excl: price, incl: Math.round(price * 1.1) };
}

/** 공고문 요약에서 AI가 읽어 낸 계산기 값. 문서에서 못 찾은 값은 null */
export type CalcHints = {
  award_mode: AwardMode | null;
  base_amount: number | null;
  base_kind: string | null;
  includes_vat: boolean | null;
  price_weight: number | null;
  floor_rate: number | null;
  lower_rate: number | null;
  range: number | null;
  notes: string[];
};

export type HintFields = { mode?: AwardMode; base?: string; includesVat?: boolean; weight?: string; floorRate?: string; lowerRate?: string; range?: string };

/** 계산기 칸에 넣을 값. 찾지 못한 값은 빼서 지금 칸을 그대로 둔다 */
export function hintsToFields(h: CalcHints): HintFields {
  const n = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? String(v) : undefined);
  const out: HintFields = {
    mode: h.award_mode ?? undefined,
    base: h.base_amount !== null && h.base_amount > 0 ? String(Math.round(h.base_amount)) : undefined,
    includesVat: h.includes_vat ?? undefined,
    weight: n(h.price_weight),
    floorRate: n(h.floor_rate),
    lowerRate: n(h.lower_rate),
    range: n(h.range),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as HintFields;
}
