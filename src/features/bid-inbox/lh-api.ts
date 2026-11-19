import type { Item } from "./d2b-api";
import { agencyDate, agencyPrice, callDataGoKr, fetchPages, label } from "./data-go-kr";
import { toApiDate, FETCH_WINDOW_DAYS } from "./g2b-api";
import { costRegionOk, isCostNotice, judgeCost, judgeHanil } from "./judge";
import type { BidNoticeInput } from "./types";

// 한국토지주택공사_입찰공고정보_GW (공공데이터포털 15159012). 입찰공고등록일 기간으로 조회, 응답은 XML
const URL = "https://apis.data.go.kr/B552555/OpenBidInfoList/getOpenBidInfo";
const PAGE_SIZE = 500;
const MAX_PAGES = 10;
/** LH 전자조달시스템. 공고별 주소는 API에 없다 */
const DETAIL_URL = "https://ebid.lh.or.kr/";

/** 한일ENG 면허(도장ㆍ습식ㆍ방수ㆍ석공사업)로 볼 요구면허명 */
const HANIL_LICENSE = /도장|방수|습식/;
const HANIL_TITLE = /방수|도장/;

/** 업종1~10 × 요구면허1~10 칸에 흩어진 면허명을 중복 없이 모은다 */
export function lhLicenses(i: Item): string[] {
  const out = new Set<string>();
  for (let r = 1; r <= 10; r++) {
    for (let l = 1; l <= 10; l++) {
      const v = label(i[`req${r}Reqlic${l}Nm`]);
      if (v) out.add(v);
    }
  }
  return [...out];
}

/** 참가지역1~4 → "충청북도, 충청남도" (제한 없으면 null) */
export function lhRegion(i: Item): string | null {
  const zones = [1, 2, 3, 4].map((n) => label(i[`zoneRstrct${n}`])).filter((z): z is string => !!z && !/^(없음|제한없음|-)$/.test(z));
  return zones.length ? zones.join(", ") : null;
}

/** API 한 건 → 원가(용역) 또는 한일ENG(공사) 공고. 해당 없으면 null */
export function toLhNotice(i: Item, now: Date): BidNoticeInput | null {
  const title = (i.bidnmKor ?? "").trim();
  const bidNo = (i.bidNum ?? "").trim();
  if (!title || !bidNo) return null;
  if (/취소/.test(`${i.bidProgrsStatus ?? ""} ${i.bidKind ?? ""}`)) return null;

  const closesAt = agencyDate(i.tndrdocAcptEndDtm, "23:59:59");
  if (closesAt && Date.parse(closesAt) <= now.getTime()) return null;

  const job = i.cstrtnJobGbNm ?? "";
  const regionLimit = lhRegion(i);
  const licenses = lhLicenses(i);
  const contractMethod = label(i.tndrCtrctMedCd);
  const awardMethod = label(i.sunjungNm);
  const presumedPrice = agencyPrice(i.presmtPrc);

  let category: BidNoticeInput["category"];
  let matchedBy: BidNoticeInput["matched_by"];
  let judged: { verdict: BidNoticeInput["verdict"]; reason: string };

  if (!/공사|물품/.test(job) && isCostNotice(title)) {
    if (regionLimit && !costRegionOk(regionLimit)) return null;
    category = "cost";
    matchedBy = "keyword";
    judged = judgeCost({ contractMethod, awardMethod, regionLimit, presumedPrice, matchedBy });
  } else if (/공사/.test(job) || (!job && !isCostNotice(title))) {
    if (licenses.some((l) => HANIL_LICENSE.test(l))) matchedBy = "industry";
    else if (HANIL_TITLE.test(title)) matchedBy = "keyword";
    else return null;
    category = "hanil";
    judged = judgeHanil({ contractMethod, awardMethod, regionLimit, presumedPrice, matchedBy });
  } else {
    return null;
  }

  return {
    category,
    source: "lh",
    matched_by: matchedBy,
    bid_no: bidNo,
    bid_ord: (i.bidDegree ?? "").trim() || "000",
    title,
    notice_kind: label(i.bidKind),
    notice_org: ["한국토지주택공사", label(i.zoneHqCd)].filter(Boolean).join(" "),
    demand_org: null,
    presumed_price: presumedPrice,
    contract_method: contractMethod,
    award_method: awardMethod,
    region_limit: regionLimit,
    main_industry: licenses.length ? licenses.slice(0, 5).join(", ") : null,
    site_region: null,
    noticed_at: agencyDate(i.tndrbidRegDt),
    closes_at: closesAt,
    opens_at: agencyDate(i.openDtm),
    detail_url: DETAIL_URL,
    verdict: judged.verdict,
    verdict_reason: judged.reason,
  };
}

/** 최근 7일 LH 공고 중 원가 용역과 도장·방수 공사 */
export async function fetchLhNotices(now = new Date()): Promise<BidNoticeInput[]> {
  const day = (d: Date) => toApiDate(d).slice(0, 8);
  const items = await fetchPages(
    (pageNo) =>
      callDataGoKr(
        URL,
        {
          pageNo: String(pageNo),
          numOfRows: String(PAGE_SIZE),
          tndrbidRegDtStart: day(new Date(now.getTime() - FETCH_WINDOW_DAYS * 86_400_000)),
          tndrbidRegDtEnd: day(now),
        },
        "LH",
      ),
    PAGE_SIZE,
    MAX_PAGES,
  );
  return items.map((i) => toLhNotice(i, now)).filter((n): n is BidNoticeInput => n !== null);
}
