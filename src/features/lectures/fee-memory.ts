import { calculateWithholding, grossFrom, type IncomeType } from "./tax";

/** 같은 제목의 일정에 물려줄 강의료. 고정 금액으로 받는 강의는 fixedGross 를 그대로 쓴다 */
export type LectureFee = {
  hourlyRate: number;
  fixedGross: number | null;
  incomeType: IncomeType;
  applyExemption: boolean;
};

export type FeeRecord = {
  title: string;
  lecture_date: string;
  hours: number | string;
  hourly_rate: number;
  gross_amount: number;
  income_type: IncomeType;
  apply_tax_exemption: boolean;
};

/** 띄어쓰기·대소문자가 달라도 같은 제목으로 본다 */
export const titleKey = (title: string) => title.replace(/\s+/g, "").toLowerCase();

/** 강의료가 아직 입력되지 않은 일정 */
export const isBlankFee = (row: { hourly_rate: number; gross_amount: number }) => row.hourly_rate === 0 && row.gross_amount === 0;

/** 강의 기록에서 강의료를 읽는다. 강의료가 없으면 null */
export function feeFrom(r: Omit<FeeRecord, "title" | "lecture_date">): LectureFee | null {
  if (isBlankFee(r)) return null;
  const auto = grossFrom(Number(r.hours), r.hourly_rate);
  return {
    hourlyRate: r.hourly_rate,
    fixedGross: r.gross_amount === auto ? null : r.gross_amount,
    incomeType: r.income_type,
    applyExemption: r.apply_tax_exemption,
  };
}

/** 그 일정의 시간으로 금액과 세금을 다시 계산한 DB 값 */
export function feeFields(hours: number | string, fee: LectureFee) {
  const gross = fee.fixedGross ?? grossFrom(Number(hours), fee.hourlyRate);
  const tax = calculateWithholding(gross, fee.incomeType, fee.applyExemption);
  return {
    hourly_rate: fee.hourlyRate,
    gross_amount: gross,
    income_type: fee.incomeType,
    apply_tax_exemption: fee.applyExemption,
    income_tax: tax.incomeTax,
    local_tax: tax.localTax,
    expected_net: tax.net,
  };
}

/** 제목별 강의료. 같은 제목이 여러 개면 가장 최근 날짜의 강의료를 쓴다 */
export function rememberedFees(records: FeeRecord[]) {
  const fees = new Map<string, LectureFee>();
  const sorted = [...records].sort((a, b) => a.lecture_date.localeCompare(b.lecture_date));
  for (const r of sorted) {
    const fee = feeFrom(r);
    if (fee) fees.set(titleKey(r.title), fee);
  }
  return fees;
}

/** 불러온 일정의 강의료가 비어 있으면 같은 제목의 강의료를 넣는다 */
export function withRememberedFee<T extends { title: string; hours: number; hourly_rate: number; gross_amount: number }>(
  row: T,
  fees: Map<string, LectureFee>,
): T {
  const fee = fees.get(titleKey(row.title));
  return fee && isBlankFee(row) ? { ...row, ...feeFields(row.hours, fee) } : row;
}
