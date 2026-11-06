import type { CategoryDef } from "./categories";
import type { BidMatch, BidNoticeInput } from "./types";

// 조달청_나라장터 입찰공고정보서비스 > 나라장터검색조건에 의한 입찰공고 조회
const BASE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

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

/** API 한 건 → 저장 값. 공고번호·공고명이 없거나 구분 조건에 맞지 않으면 null */
export function toNotice(item: ApiItem, category: CategoryDef, matchedBy: BidMatch): BidNoticeInput | null {
  const bidNo = text(item.bidNtceNo);
  const title = text(item.bidNtceNm);
  if (!bidNo || !title || !category.accept(title)) return null;

  const contractMethod = text(item.cntrctCnclsMthdNm);
  const awardMethod = text(item.sucsfbidMthdNm);
  const regionLimit = text(item.prtcptLmtRgnNm);
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

  const res = (json.response ?? json) as { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; totalCount?: unknown } };
  const code = res.header?.resultCode;
  if (code && code !== "00") throw new Error(`나라장터 API 오류: ${res.header?.resultMsg ?? code}`);

  // 결과가 없으면 items가 빈 문자열, 형식에 따라 { item: [...] } 로 오기도 한다
  const raw = res.body?.items;
  const list = Array.isArray(raw) ? raw : (raw as { item?: unknown } | undefined)?.item;
  const items = (Array.isArray(list) ? list : list ? [list] : []) as ApiItem[];
  return { items, total: Number(res.body?.totalCount) || 0 };
}

async function fetchSearch(operation: string, search: Record<string, string>, now: Date): Promise<ApiItem[]> {
  const key = process.env.BID_API_KEY;
  if (!key) throw new Error("BID_API_KEY가 설정되지 않았습니다.");

  const begin = new Date(now.getTime() - FETCH_WINDOW_DAYS * 86_400_000);
  const all: ApiItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      numOfRows: String(PAGE_SIZE),
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
    if (items.length === 0 || page * PAGE_SIZE >= total) break;
  }
  return all;
}

/** 한 구분의 최근 공고. 같은 공고번호·차수는 앞선 검색(업종) 결과를 쓴다. */
export async function fetchCategoryNotices(category: CategoryDef, now = new Date()): Promise<BidNoticeInput[]> {
  const results = await Promise.all(category.searches.map((s) => fetchSearch(category.operation, s.params, now)));
  const found = new Map<string, BidNoticeInput>();
  results.forEach((items, i) => {
    for (const item of items) {
      const n = toNotice(item, category, category.searches[i].matchedBy);
      const id = n && `${n.bid_no}-${n.bid_ord}`;
      if (n && id && !found.has(id)) found.set(id, n);
    }
  });
  return [...found.values()];
}
