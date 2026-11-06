import type { BidMatch, BidVerdict } from "./types";

// '원가'가 들어가지만 원가 용역이 아닌 낱말
const FALSE_POSITIVE = /창원가|지원가|경원가|원가족/g;

/** 공고명에 진짜 '원가'가 들어 있는지 (창원가·지원가 같은 오탐 제외) */
export function isCostNotice(title: string) {
  return title.replace(FALSE_POSITIVE, "").includes("원가");
}

export type JudgeInput = {
  contractMethod: string | null;
  awardMethod: string | null;
  regionLimit: string | null;
  presumedPrice: number | null;
  matchedBy: BidMatch;
};

type Judgment = { verdict: BidVerdict; reason: string };

/**
 * 원가계산: 충북대학교산학협력단(충북 소재) 기준 1차 판정. 공고 목록 정보만 보므로 참고용이며,
 * 참가자격은 공고문에서 다시 확인해야 한다.
 */
export function judgeCost({ contractMethod, awardMethod, regionLimit }: JudgeInput): Judgment {
  const method = contractMethod ?? "";
  const award = awardMethod ?? "";
  const region = (regionLimit ?? "").trim();

  if (/수의|견적|지명/.test(method)) return { verdict: "na", reason: `${method}: 공개 투찰 대상 아님` };
  if (region && !/충북|충청북도|전국/.test(region)) return { verdict: "impossible", reason: `지역 제한: ${region}` };
  if (/제한/.test(method)) return { verdict: "check", reason: "제한경쟁: 공고문에서 참가자격 확인 필요" };
  if (/일반/.test(method) || /협상/.test(award) || /협상/.test(method)) {
    return { verdict: "possible", reason: `${method || award}: 공고문 검토 후 투찰 가능` };
  }
  return { verdict: "check", reason: "계약방법을 확인할 수 없음: 공고문 확인 필요" };
}

/** 한일ENG 시공 가능 금액 상한 (원) */
export const HANIL_MAX_PRICE = 700_000_000;

/** 천안 업체가 들어갈 수 있는 지역인지. '충청남도 계룡시'처럼 다른 시·군으로 좁힌 제한은 안 된다 */
function hanilRegionOk(region: string) {
  return region.split(",").some((r) => /천안|전국/.test(r) || /^(충남|충청남도)$/.test(r.trim()));
}

/**
 * 한일ENG: 충남 천안 소재, 7억 원까지 시공 기준 1차 판정.
 * 소액 수의 공사도 견적 투찰 대상이므로 원가계산과 달리 수의계약을 제외하지 않는다.
 */
export function judgeHanil({ contractMethod, regionLimit, presumedPrice, matchedBy }: JudgeInput): Judgment {
  const method = contractMethod ?? "";
  const region = (regionLimit ?? "").trim();

  if (presumedPrice !== null && presumedPrice > HANIL_MAX_PRICE) {
    return { verdict: "impossible", reason: "추정가격이 시공 가능 금액 7억 원 초과" };
  }
  if (region && !hanilRegionOk(region)) return { verdict: "impossible", reason: `지역 제한: ${region}` };
  if (matchedBy === "keyword") return { verdict: "check", reason: "공고명으로 찾은 공고: 업종 확인 필요" };
  if (/제한/.test(method)) return { verdict: "check", reason: "제한경쟁: 공고문에서 참가자격 확인 필요" };
  if (/일반|수의|협상/.test(method)) return { verdict: "possible", reason: `${method}: 공고문 검토 후 투찰 가능` };
  return { verdict: "check", reason: "계약방법을 확인할 수 없음: 공고문 확인 필요" };
}

export const VERDICT_LABEL: Record<BidVerdict, string> = {
  possible: "가능(검토)",
  check: "자격 확인",
  impossible: "불가",
  na: "해당 없음",
};
