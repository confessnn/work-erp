/**
 * 무엇을 제출하는 공고인지. 낙찰 방식 문구로 나눈 1차 구분이다.
 * proposal = 제안서·규격서 제출, price = 입찰가격(견적)만, unknown = 공고문 확인
 */
export type SubmissionKind = "proposal" | "price" | "unknown";

export function submissionKind(awardMethod: string | null): SubmissionKind {
  const method = awardMethod ?? "";
  // 규격가격동시입찰·2단계경쟁입찰은 규격·제안 평가를 통과해야 가격을 비교한다
  if (/협상|규격가격|2단계|제안/.test(method)) return "proposal";
  if (/적격심사|소액수의|수의시담|최저가/.test(method)) return "price";
  return "unknown";
}

export const SUBMISSION_LABEL: Record<SubmissionKind, string> = {
  proposal: "제안서 제출",
  price: "가격만 제출",
  unknown: "제출 확인",
};

export const SUBMISSION_HINT: Record<SubmissionKind, string> = {
  proposal: "제안서 또는 규격서를 함께 내는 공고입니다. 낙찰 방식 기준의 1차 구분이니 공고문을 확인하세요.",
  price: "입찰가격이나 견적만 내는 공고입니다. 적격심사는 개찰 후 심사 서류를 낼 수 있으니 공고문을 확인하세요.",
  unknown: "낙찰 방식으로 나눌 수 없는 공고입니다. 공고문에서 제출 서류를 확인하세요.",
};
