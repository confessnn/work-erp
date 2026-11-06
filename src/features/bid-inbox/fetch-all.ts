import { fetchD2bNotices } from "./d2b-api";
import { fetchCategoryNotices, fetchRegionLimits } from "./g2b-api";
import { CATEGORIES } from "./categories";
import type { BidNoticeInput } from "./types";

export type SourceResult = {
  label: string;
  rows: BidNoticeInput[];
  /** 상세까지 확인해 다시 조회하지 않을 공고 키 (국방부만) */
  checked?: string[];
  note?: string;
  error?: string;
};

/**
 * 모든 구분·출처를 수신한다. 한 곳이 실패해도 나머지는 저장되도록 결과를 나눠 돌려준다.
 * knownD2b: 이미 확인한 국방부 공고 키 (하루 호출 한도를 아끼기 위해 다시 조회하지 않는다)
 */
export async function fetchAllNotices(knownD2b: Set<string>, now = new Date()): Promise<SourceResult[]> {
  // 지역을 못 받으면 지역 제한 공고가 '가능'으로 잘못 보이므로 나라장터 수신을 실패로 둔다 (다음 수신 때 7일치를 다시 받는다)
  const regions = fetchRegionLimits(now);
  const g2b = CATEGORIES.map(async (c): Promise<SourceResult> => {
    const label = c.key === "hanil" ? `${c.label} 나라장터` : c.label;
    try {
      return { label, rows: await fetchCategoryNotices(c, await regions, now) };
    } catch (e) {
      return { label, rows: [], error: e instanceof Error ? e.message : "알 수 없는 오류" };
    }
  });
  const d2b = fetchD2bNotices(knownD2b, now).then((r): SourceResult => ({
    label: "한일ENG 국방부",
    rows: r.rows,
    checked: r.checked,
    note: r.remaining > 0 ? `${r.remaining}건은 다음 수신 때 확인` : undefined,
    error: r.error,
  }));
  return Promise.all([...g2b, d2b]);
}
