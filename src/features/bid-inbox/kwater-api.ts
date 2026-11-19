import type { Item } from "./d2b-api";
import { agencyDate, agencyPrice, callDataGoKr, fetchPages, label } from "./data-go-kr";
import { toApiDate, FETCH_WINDOW_DAYS } from "./g2b-api";
import { isCostNotice, judgeCost, judgeHanil } from "./judge";
import type { BidNoticeInput } from "./types";

// 한국수자원공사_전자조달 입찰공고 (공공데이터포털 15101635). 검색년월(YYYYMM) 단위로 조회, 응답은 XML
const BASE_URL = "https://apis.data.go.kr/B500001/ebid/tndr3";
const PAGE_SIZE = 500;
const MAX_PAGES = 5;
/** K-water 전자조달시스템. 공고별 주소는 API에 없다 */
const DETAIL_URL = "https://ebid.kwater.or.kr/";
const HANIL_TITLE = /방수|도장/;

type Kind = "cost" | "hanil";

/**
 * API 한 건 → 저장 값. K-water API에는 참가지역·면허 항목이 없어 공고명으로만 고르고,
 * '가능' 판정도 참가지역을 공고문에서 확인하도록 '자격 확인'으로 낮춘다.
 */
export function toKwaterNotice(i: Item, kind: Kind, now: Date): BidNoticeInput | null {
  const title = (i.tndrPblancNm ?? "").trim();
  const bidNo = (i.tndrPbanno ?? "").trim();
  if (!title || !bidNo) return null;
  if (/취소/.test(i.tndrStat ?? "")) return null;
  if (kind === "cost" ? !isCostNotice(title) : !HANIL_TITLE.test(title)) return null;

  // 신청마감일은 날짜만 온다. 그날 끝까지 열려 있는 것으로 본다
  const closesAt = agencyDate(i.tndrPblancEnddt, "23:59:59");
  if (closesAt && Date.parse(closesAt) <= now.getTime()) return null;

  const contractMethod = label(i.ctrmthdCdNm);
  const amount = agencyPrice(i.tndrPlnprc);
  let judged =
    kind === "cost"
      ? judgeCost({ contractMethod, awardMethod: null, regionLimit: null, presumedPrice: null, matchedBy: "keyword" })
      : // 금액이 부가세 포함일 수 있어 7억 경계 공사를 놓치지 않도록 1.1로 나눠 판정한다
        judgeHanil({ contractMethod, awardMethod: null, regionLimit: null, presumedPrice: amount && Math.round(amount / 1.1), matchedBy: "keyword" });
  if (judged.verdict === "possible") {
    judged = { verdict: "check", reason: `${judged.reason} (참가지역 정보가 없어 공고문 확인 필요)` };
  }

  return {
    category: kind,
    source: "kwater",
    matched_by: "keyword",
    bid_no: bidNo,
    bid_ord: "000",
    title,
    notice_kind: label(i.tndrStat),
    notice_org: ["한국수자원공사", label(i.cntrctDeptNm)].filter(Boolean).join(" "),
    demand_org: null,
    presumed_price: amount,
    contract_method: contractMethod,
    award_method: null,
    region_limit: null,
    main_industry: null,
    site_region: null,
    noticed_at: agencyDate(i.tndrPblancDe),
    closes_at: closesAt,
    opens_at: null,
    detail_url: DETAIL_URL,
    verdict: judged.verdict,
    verdict_reason: judged.reason,
  };
}

/** 최근 7일이 걸친 달(1~2개)을 조회 년월로 */
export function searchMonths(now: Date): string[] {
  const month = (d: Date) => toApiDate(d).slice(0, 6);
  return [...new Set([month(new Date(now.getTime() - FETCH_WINDOW_DAYS * 86_400_000)), month(now)])];
}

/** K-water 공고 중 원가 용역(servcList)과 도장·방수 공사(cntrwkList) */
export async function fetchKwaterNotices(now = new Date()): Promise<BidNoticeInput[]> {
  const out: BidNoticeInput[] = [];
  const jobs: [string, Kind][] = [
    ["servcList", "cost"],
    ["cntrwkList", "hanil"],
  ];
  for (const [operation, kind] of jobs) {
    for (const searchDt of searchMonths(now)) {
      const items = await fetchPages(
        (pageNo) =>
          callDataGoKr(`${BASE_URL}/${operation}`, { pageNo: String(pageNo), numOfRows: String(PAGE_SIZE), searchDt }, "K-water"),
        PAGE_SIZE,
        MAX_PAGES,
      );
      for (const i of items) {
        const n = toKwaterNotice(i, kind, now);
        if (n) out.push(n);
      }
    }
  }
  return out;
}
