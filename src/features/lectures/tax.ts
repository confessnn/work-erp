/**
 * 강의료 원천징수 계산.
 *
 * - 사업소득(business): 소득세 3% + 지방소득세(소득세의 10%) = 3.3%
 * - 기타소득(other):    강연료는 필요경비 60% 공제 → 기타소득금액 40%에 소득세 20%
 *                       = 지급액의 8% + 지방소득세 0.8% = 8.8%
 *
 * 세액은 원단위 절사(10원 미만 버림).
 * apply_tax_exemption 이 true 이면:
 * - 기타소득: 기타소득금액 5만 원 이하(지급액 12.5만 원 이하)면 과세최저한으로 0원
 * - 공통: 소득세가 1,000원 미만이면 소액부징수로 0원
 *
 * 모든 금액은 원 단위 정수.
 */

export type IncomeType = "business" | "other";

export const INCOME_TYPE_LABEL: Record<IncomeType, string> = {
  business: "사업소득 (3.3%)",
  other: "기타소득 (8.8%)",
};

export type TaxResult = {
  incomeTax: number;
  localTax: number;
  totalTax: number;
  net: number;
};

const floorTo10 = (n: number) => Math.floor(n / 10) * 10;

export function calculateWithholding(
  gross: number,
  incomeType: IncomeType,
  applyExemption = true,
): TaxResult {
  const amount = Math.max(0, Math.round(gross));

  let incomeTax: number;
  if (incomeType === "business") {
    incomeTax = floorTo10((amount * 3) / 100);
  } else {
    const otherIncome = Math.floor((amount * 40) / 100);
    if (applyExemption && otherIncome <= 50_000) {
      incomeTax = 0;
    } else {
      incomeTax = floorTo10((otherIncome * 20) / 100);
    }
  }

  if (applyExemption && incomeTax < 1_000) {
    incomeTax = 0;
  }

  const localTax = floorTo10(incomeTax / 10);
  const totalTax = incomeTax + localTax;

  return { incomeTax, localTax, totalTax, net: amount - totalTax };
}

/** "HH:MM" 두 개로 강의 시간(시간 단위, 소수 둘째 자리) 계산. 종료가 시작보다 이르면 0. */
export function hoursBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const diff = toMin(end) - toMin(start);
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.round((diff / 60) * 100) / 100;
}

export function grossFrom(hours: number, hourlyRate: number): number {
  return Math.round(hours * hourlyRate);
}
