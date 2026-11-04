import type { Lecture } from "@/features/lectures/types";

export type Summary = {
  count: number;
  totalHours: number;
  grossTotal: number; // 총 강의료 (세전)
  taxTotal: number; // 원천징수 합계
  expectedNet: number; // 예상 수령액 (세후, 전체)
  receivedTotal: number; // 수령한 금액 (실제 입금액)
  receivedExpected: number; // 수령 완료 건의 예상 수령액
  unpaidTotal: number; // 미수령 금액 (미수령 건의 예상 수령액)
  unpaidCount: number;
  paidCount: number;
};

/** 수령 완료 건의 실제 수령액. 입력하지 않았으면 예상 수령액으로 본다. */
export const actualPaid = (l: Pick<Lecture, "paid_amount" | "expected_net">) =>
  l.paid_amount ?? l.expected_net;

export function summarize(lectures: Lecture[]): Summary {
  const s: Summary = {
    count: lectures.length,
    totalHours: 0,
    grossTotal: 0,
    taxTotal: 0,
    expectedNet: 0,
    receivedTotal: 0,
    receivedExpected: 0,
    unpaidTotal: 0,
    unpaidCount: 0,
    paidCount: 0,
  };

  for (const l of lectures) {
    s.totalHours += Number(l.hours);
    s.grossTotal += l.gross_amount;
    s.taxTotal += l.income_tax + l.local_tax;
    s.expectedNet += l.expected_net;
    if (l.is_paid) {
      s.paidCount += 1;
      s.receivedTotal += actualPaid(l);
      s.receivedExpected += l.expected_net;
    } else {
      s.unpaidCount += 1;
      s.unpaidTotal += l.expected_net;
    }
  }
  s.totalHours = Math.round(s.totalHours * 100) / 100;
  return s;
}

export type MonthRow = { month: number; summary: Summary };

/** 연도별 화면용: 1~12월 각각의 합계 */
export function summarizeByMonth(lectures: Lecture[]): MonthRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const rows = lectures.filter((l) => Number(l.lecture_date.slice(5, 7)) === month);
    return { month, summary: summarize(rows) };
  });
}
