import { kstToIso, toApiDate, FETCH_WINDOW_DAYS } from "./g2b-api";
import { judgeHanil, HANIL_MAX_PRICE } from "./judge";
import type { BidNoticeInput } from "./types";

// 방위사업청_군수품조달정보 입찰공고_GW. 나라장터와 같은 서비스키를 쓰고, 응답은 XML이다.
const BASE_URL = "https://apis.data.go.kr/1690000/BidPblancInfoService";

/** 한일ENG 면허: 도장ㆍ습식ㆍ방수ㆍ석공사업 */
const HANIL_LICENSE = "[4992]";

// 기초금액은 추정가격보다 약 8~10% 크다. 7억 공사를 놓치지 않을 만큼 넉넉히 잡아, 이보다 크면 상세 조회를 아낀다
const MAX_BASE_AMOUNT = HANIL_MAX_PRICE * 1.3;
/** 공개수의는 앞으로 마감할 공고를 이 기간만큼 조회한다 */
const FORWARD_DAYS = 14;
/** 개발계정 하루 100회 한도를 넘지 않도록 한 번에 조회할 상세 건수. 남은 건은 다음 수신 때 이어서 본다 */
export const MAX_DETAILS_PER_RUN = 60;
const CONCURRENCY = 5;

type Item = Record<string, string>;

const decode = (s: string) =>
  s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .trim();

/** 응답 XML → 항목 목록. 오류 응답이면 이유를 담아 throw (서비스키가 메시지에 섞이지 않도록 정해진 칸만 읽음) */
export function parseXml(xml: string): { items: Item[]; total: number } {
  const tag = (name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
  if (xml.includes("<OpenAPI_ServiceResponse>")) {
    throw new Error(`국방부 API 오류: ${tag("returnAuthMsg") ?? tag("errMsg") ?? "인증 실패"}`);
  }
  const code = tag("resultCode");
  if (code && code !== "00") throw new Error(`국방부 API 오류: ${tag("resultMsg") ?? code}`);
  if (!code) throw new Error("국방부 API 오류: 응답을 읽을 수 없음");

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) =>
    Object.fromEntries([...m[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)].map((x) => [x[1], decode(x[2])])),
  );
  return { items, total: Number(tag("totalCount")) || 0 };
}

/** "[44000] 충청남도^[16] 경기도" → "충청남도, 경기도" */
export function cleanList(v: string | undefined): string | null {
  const s = (v ?? "")
    .split(/[\^|]/)
    .map((x) => x.replace(/\[\d+\]/, "").trim())
    .filter(Boolean);
  return s.length ? s.join(", ") : null;
}

type Candidate = {
  /** 이미 본 공고를 다시 조회하지 않기 위한 키 */
  key: string;
  list: Item;
  closesAt: string | null;
  detail: () => Promise<Item | undefined>;
};

/** 상세 응답 → 저장 값. 면허 조건이 맞지 않으면 null */
export function toD2bNotice(list: Item, detail: Item, closesAt: string | null): BidNoticeInput | null {
  if (!detail.lcnsLmttList?.includes(HANIL_LICENSE)) return null;

  const contractMethod = detail.cntrctMth || null;
  const regionLimit = cleanList(detail.areaLmttList);
  const presumedPrice = Number(detail.estmPrce) > 0 ? Math.round(Number(detail.estmPrce)) : null;
  const { verdict, reason } = judgeHanil({
    contractMethod,
    awardMethod: detail.sucbidrDecsnMth || null,
    regionLimit,
    presumedPrice,
    matchedBy: "industry",
  });

  return {
    category: "hanil",
    source: "d2b",
    matched_by: "industry",
    bid_no: list.pblancNo,
    bid_ord: list.pblancOdr,
    title: list.cntrwkNm,
    notice_kind: list.pblancSe || "공개수의",
    notice_org: list.ornt || null,
    demand_org: null,
    presumed_price: presumedPrice,
    contract_method: contractMethod,
    award_method: detail.sucbidrDecsnMth || null,
    region_limit: regionLimit,
    main_industry: cleanList(detail.lcnsLmttList),
    site_region: detail.lc || null,
    noticed_at: list.pblancDate ? kstToIso(`${list.pblancDate}0000`) : null,
    closes_at: closesAt,
    opens_at: kstToIso(list.opengDt),
    detail_url: "https://www.d2b.go.kr/",
    verdict,
    verdict_reason: reason,
  };
}

async function call(operation: string, params: Record<string, string>) {
  const key = process.env.BID_API_KEY;
  if (!key) throw new Error("BID_API_KEY가 설정되지 않았습니다.");
  const serviceKey = key.includes("%") ? key : encodeURIComponent(key);
  const res = await fetch(`${BASE_URL}/${operation}?serviceKey=${serviceKey}&${new URLSearchParams(params)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return parseXml(await res.text());
}

const isSmallConstruction = (i: Item) => i.busiDivs === "공사" && Number(i.baseAmnt || 0) <= MAX_BASE_AMOUNT;

/** 시설 경쟁입찰 + 공개수의협상 목록에서 상세를 볼 만한 공사만 고른다 (목록에는 면허·지역이 없다) */
async function listCandidates(now: Date): Promise<Candidate[]> {
  const day = (d: Date) => toApiDate(d).slice(0, 8);
  const [competitive, negotiated] = await Promise.all([
    call("getFcltyCmpetBidPblancList", {
      numOfRows: "500",
      pageNo: "1",
      anmtDateBegin: day(new Date(now.getTime() - FETCH_WINDOW_DAYS * 86_400_000)),
      anmtDateEnd: day(now),
    }),
    call("getFcltyOthbcVltrnNtatPlanList", {
      numOfRows: "500",
      pageNo: "1",
      prqudoPresentnClosDateBegin: day(now),
      prqudoPresentnClosDateEnd: day(new Date(now.getTime() + FORWARD_DAYS * 86_400_000)),
    }),
  ]);

  const isOpen = (closesAt: string | null) => !closesAt || Date.parse(closesAt) > now.getTime();
  const candidates: Candidate[] = [];

  for (const i of competitive.items) {
    const closesAt = kstToIso(i.biddocPresentnClosDt);
    if (!isSmallConstruction(i) || i.pblancSe === "취소공고" || !isOpen(closesAt)) continue;
    candidates.push({
      key: `${i.pblancNo}-${i.pblancOdr}`,
      list: i,
      closesAt,
      detail: async () =>
        (await call("getFcltyCmpetBidPblancDetail", {
          pblancYear: i.pblancYear,
          pblancSeCode: i.pblancSeCode,
          pblancNo: i.pblancNo,
          pblancOdr: i.pblancOdr,
          cntrwkNo: i.cntrwkNo,
          orntCode: i.orntCode,
        })).items[0],
    });
  }
  for (const i of negotiated.items) {
    const closesAt = kstToIso(i.prqudoPresentnClosDt);
    if (!isSmallConstruction(i) || i.progrsSttus !== "진행중" || !isOpen(closesAt)) continue;
    candidates.push({
      key: `${i.pblancNo}-${i.pblancOdr}`,
      list: i,
      closesAt,
      detail: async () =>
        (await call("getFcltyOthbcVltrnNtatPlanDetail", {
          orntCode: i.orntCode,
          cntrwkNo: i.cntrwkNo,
          ntatPlanDate: i.ntatPlanDate,
          pblancNo: i.pblancNo,
          pblancOdr: i.pblancOdr,
        })).items[0],
    });
  }
  return candidates;
}

export type D2bResult = {
  rows: BidNoticeInput[];
  /** 상세까지 확인한 공고 키. 저장해 두고 다음 수신 때 다시 조회하지 않는다 */
  checked: string[];
  /** 한도 때문에 다음 수신으로 미룬 건수 */
  remaining: number;
  error?: string;
};

/** 국방부 공고 중 한일ENG 면허가 맞는 공사. 오류가 나도 그때까지 확인한 결과는 돌려준다. */
export async function fetchD2bNotices(known: Set<string>, now = new Date(), maxDetails = MAX_DETAILS_PER_RUN): Promise<D2bResult> {
  const result: D2bResult = { rows: [], checked: [], remaining: 0 };
  try {
    const seen = new Set<string>();
    const todo = (await listCandidates(now))
      .filter((c) => !known.has(c.key) && !seen.has(c.key) && seen.add(c.key))
      // 마감이 가까운 공고부터 확인한다
      .sort((a, b) => (a.closesAt ?? "9").localeCompare(b.closesAt ?? "9"));

    const batch = todo.slice(0, maxDetails);
    result.remaining = todo.length - batch.length;

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      await Promise.all(
        batch.slice(i, i + CONCURRENCY).map(async (c) => {
          const detail = await c.detail();
          if (detail) {
            const n = toD2bNotice(c.list, detail, c.closesAt);
            if (n) result.rows.push(n);
          }
          result.checked.push(c.key);
        }),
      );
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : "알 수 없는 오류";
  }
  return result;
}
