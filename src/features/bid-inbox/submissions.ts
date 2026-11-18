// 내 투찰 기록과 개찰 결과 맞춰 보기 (순수 함수: 화면과 테스트에서 함께 씀)
import type { OpeningRow } from "./award-history";

export type SubmissionPlan = "attack" | "balanced" | "safe" | "manual";
export type SubmissionResult = "pending" | "won" | "lost" | "invalid" | "cancelled";

export const PLAN_LABEL: Record<SubmissionPlan, string> = { attack: "공격", balanced: "균형", safe: "보수", manual: "직접" };
export const RESULT_LABEL: Record<SubmissionResult, string> = { pending: "결과 대기", won: "낙찰", lost: "탈락", invalid: "무효", cancelled: "취소·유찰" };

export type Submission = {
  id: string;
  notice_id: string;
  plan: SubmissionPlan;
  amount: number;
  base_amount: number | null;
  rate: number | null;
  submitted_on: string;
  memo: string | null;
  result: SubmissionResult;
  rank: number | null;
  participants: number | null;
  open_rate: number | null;
  winner_rate: number | null;
  winner_amount: number | null;
  checked_at: string | null;
};

/**
 * 개찰 순위에서 우리 업체(사업자번호)를 찾아 결과를 정한다.
 * 협상 계약은 가격 개찰 뒤 기술평가로 정해지므로 순위만 적고 결과는 대기로 둔다.
 */
export function matchOpening(rows: OpeningRow[], bizno: string, negotiation: boolean) {
  const mine = rows.find((r) => r.bizno === bizno);
  if (!mine) return null;
  const first = rows.find((r) => r.rank === 1) ?? [...rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))[0];
  const result: SubmissionResult = negotiation ? "pending" : mine.rank === 1 ? "won" : "lost";
  return {
    rank: mine.rank,
    participants: rows.length,
    open_rate: Number.isFinite(mine.rate) ? mine.rate : null,
    winner_rate: first && Number.isFinite(first.rate) ? first.rate : null,
    winner_amount: first?.amount ?? null,
    result,
  };
}

/** 기록 모음 요약: 건수, 낙찰 수, 낙찰 비율(결과 난 것 중), 1등과의 평균 차이(%p, 우리 - 1등) */
export function summarize(list: Pick<Submission, "result" | "open_rate" | "winner_rate">[]) {
  const decided = list.filter((s) => s.result === "won" || s.result === "lost");
  const won = decided.filter((s) => s.result === "won").length;
  const gaps = list.filter((s) => s.open_rate !== null && s.winner_rate !== null).map((s) => Number(s.open_rate) - Number(s.winner_rate));
  return {
    total: list.length,
    won,
    winRate: decided.length ? (won / decided.length) * 100 : null,
    avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
  };
}
