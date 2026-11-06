import type { CategoryDef } from "./categories";
import type { BidMatch, BidNoticeInput } from "./types";

// 조달청_나라장터 입찰공고정보서비스. 주소와 오퍼레이션 이름 모두 끝에 02가 붙는다
const BASE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService02";
/** 입찰공고 목록 정보에 대한 참가가능지역 조회. 공고 목록에는 지역 제한 항목이 없다 */
const REGION_OPERATION = "getBidPblancListInfoPrtcptPsblRgn02";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const REGION_PAGE_SIZE = 999;
const REGION_MAX_PAGES = 30;

/** 매번 최근 7일을 다시 조회한다. 저장 때 중복을 건너뛰므로 며칠 실패해도 빠지는 공고가 없다. */
export const FETCH_WINDOW_DAYS = 7;

type ApiItem = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** "2026-11-05 10:00:00" (한국 시간) → ISO. 형식이 다르면 null */
export function kstToIso(v: unknown): string | null {
  const m = text(v)?.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})[ T]?(\d{2}):?(\d{2})(?::?(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+09:00`;
}

/** Date → API 조회 형식 "YYYYMMDDHHmm" (한국 시간) */
export function toApiDate(d: Date) {
  return d
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .replace(/[-: ]/g, "")
    .slice(0, 12);
}

function price(v: unknown): number | null {
  const n = Number(String(v ?? "").replaceAll(",", ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** API 한 건 → 저장 값. 공고번호·공고명이 없거나 구분·지역 조건에 맞지 않으면 null */
export function toNotice(item: ApiItem, category: CategoryDef, matchedBy: BidMatch, regionLimit: string | null = null): BidNoticeInput | null {
  const bidNo = text(item.bidNtceNo);
  const title = text(item.bidNtceNm);
  if (!bidNo || !title || !category.accept(title)) return null;
  if (regionLimit && category.regionOk && !category.regionOk(regionLimit)) return null;

  const contractMethod = text(item.cntrctCnclsMthdNm);
  const awardMethod = text(item.sucsfbidMthdNm);
  const presumedPrice = price(item.presmptPrce);
  const { verdict, reason } = category.judge({ contractMethod, awardMethod, regionLimit, presumedPrice, matchedBy });

  return {
    category: category.key,
    source: "g2b",
    matched_by: matchedBy,
    bid_no: bidNo,
    bid_ord: text(item.bidNtceOrd) ?? "000",
    title,
    notice_kind: text(item.ntceKindNm),
    notice_org: text(item.ntceInsttNm),
    demand_org: text(item.dminsttNm),
    presumed_price: presumedPrice,
    contract_method: contractMethod,
    award_method: awardMethod,
    region_limit: regionLimit,
    main_industry: text(item.mainCnsttyNm),
    site_region: text(item.cnstrtsiteRgnNm),
    noticed_at: kstToIso(item.bidNtceDt),
    closes_at: kstToIso(item.bidClseDt),
    opens_at: kstToIso(item.opengDt),
    detail_url: text(item.bidNtceDtlUrl) ?? text(item.bidNtceUrl),
    verdict,
    verdict_reason: reason,
  };
}

/** 응답 본문 해석. 오류 응답이면 이유를 담아 throw (서비스키가 메시지에 섞이지 않도록 정해진 칸만 읽음) */
export function parseResponse(body: string): { items: ApiItem[]; total: number } {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body);
  } catch {
    const code = body.match(/<(?:returnAuthMsg|errMsg|resultMsg)>([^<]+)</)?.[1];
    throw new Error(`나라장터 API 오류: ${code ?? "응답을 읽을 수 없음"}`);
  }

  const denied = json.OpenAPI_ServiceResponse as { cmmMsgHeader?: { returnAuthMsg?: string; errMsg?: string } } | undefined;
  if (denied) throw new Error(`나라장터 API 오류: ${denied.cmmMsgHeader?.returnAuthMsg ?? denied.cmmMsgHeader?.errMsg ?? "인증 실패"}`);

  // 요청 값이 틀리면 { "nkoneps.com.response.ResponseError": { header: {...} } } 로 온다
  const failed = Object.entries(json).find(([name]) => name.endsWith("ResponseError"))?.[1] as { header?: { resultMsg?: string } } | undefined;
  if (failed) throw new Error(`나라장터 API 오류: ${failed.header?.resultMsg ?? "요청 오류"}`);

  const res = (json.response ?? json) as { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; totalCount?: unknown } };
  const code = res.header?.resultCode;
  if (code && code !== "00") throw new Error(`나라장터 API 오류: ${res.header?.resultMsg ?? code}`);

  // 결과가 없으면 items가 빈 문자열, 형식에 따라 { item: [...] } 로 오기도 한다
  const raw = res.body?.items;
  const list = Array.isArray(raw) ? raw : (raw as { item?: unknown } | undefined)?.item;
  const items = (Array.isArray(list) ? list : list ? [list] : []) as ApiItem[];
  return { items, total: Number(res.body?.totalCount) || 0 };
}

async function fetchSearch(operation: string, search: Record<string, string>, now: Date, pageSize = PAGE_SIZE, maxPages = MAX_PAGES): Promise<ApiItem[]> {
  const key = process.env.BID_API_KEY;
  if (!key) throw new Error("BID_API_KEY가 설정되지 않았습니다.");

  const begin = new Date(now.getTime() - FETCH_WINDOW_DAYS * 86_400_000);
  const all: ApiItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      numOfRows: String(pageSize),
      pageNo: String(page),
      type: "json",
      inqryDiv: "1", // 공고게시일시 기준
      inqryBgnDt: toApiDate(begin),
      inqryEndDt: toApiDate(now),
      ...search,
    });
    // 이미 인코딩된 키를 붙여 넣어도 동작하도록 % 가 있으면 그대로 쓴다
    const serviceKey = key.includes("%") ? key : encodeURIComponent(key);
    const res = await fetch(`${BASE_URL}/${operation}?serviceKey=${serviceKey}&${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const { items, total } = parseResponse(await res.text());
    all.push(...items);
    if (items.length === 0 || page * pageSize >= total) break;
  }
  return all;
}

/** 참가가능지역 행 → "공고번호-차수"별 지역 목록 */
export function groupRegions(items: ApiItem[]): Map<string, string> {
  const regions = new Map<string, string[]>();
  for (const item of items) {
    const region = text(item.prtcptPsblRgnNm);
    if (!region) continue;
    const id = `${text(item.bidNtceNo)}-${text(item.bidNtceOrd) ?? "000"}`;
    regions.set(id, [...(regions.get(id) ?? []), region]);
  }
  return new Map([...regions].map(([id, list]) => [id, [...new Set(list)].join(", ")]));
}

/** 최근 공고의 참가가능지역 (공고 목록에 없어 따로 받는다) */
export async function fetchRegionLimits(now = new Date()): Promise<Map<string, string>> {
  return groupRegions(await fetchSearch(REGION_OPERATION, {}, now, REGION_PAGE_SIZE, REGION_MAX_PAGES));
}

type Found = { item: ApiItem; matchedBy: BidMatch; ord: string };

/**
 * 공고번호마다 최신 차수만 남긴다. 취소됐거나 이미 마감된 공고는 뺀다.
 * 차수가 같으면 앞선 검색(업종) 결과를 쓴다.
 */
export function pickOpenNotices(results: { items: ApiItem[]; matchedBy: BidMatch }[], now: Date): Found[] {
  const latest = new Map<string, Found>();
  for (const { items, matchedBy } of results) {
    for (const item of items) {
      const no = text(item.bidNtceNo);
      if (!no) continue;
      const ord = text(item.bidNtceOrd) ?? "000";
      const prev = latest.get(no);
      if (!prev || ord > prev.ord) latest.set(no, { item, matchedBy, ord });
    }
  }
  return [...latest.values()].filter(({ item }) => {
    if (text(item.ntceKindNm)?.includes("취소")) return false;
    const closesAt = kstToIso(item.bidClseDt);
    return !closesAt || Date.parse(closesAt) > now.getTime();
  });
}

/** 한 구분의 최근 공고 */
export async function fetchCategoryNotices(category: CategoryDef, regions: Map<string, string>, now = new Date()): Promise<BidNoticeInput[]> {
  const results = await Promise.all(
    category.searches.map(async (s) => ({ items: await fetchSearch(category.operation, s.params, now), matchedBy: s.matchedBy })),
  );
  return pickOpenNotices(results, now).flatMap(({ item, matchedBy, ord }) => {
    const n = toNotice(item, category, matchedBy, regions.get(`${text(item.bidNtceNo)}-${ord}`) ?? null);
    return n ? [n] : [];
  });
}
