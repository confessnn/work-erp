// 조달청_나라장터 낙찰정보서비스: 지난 원가 용역의 낙찰금액·낙찰률을 받아 계산기 3안의 근거로 쓴다.
// 응답에는 낙찰 업체 대표자·전화·주소도 있지만 쓰지 않고 저장하지도 않는다.
import type { AwardMode } from "./calc";
import { callApi, parseResponse } from "./g2b-api";

const BASE_URL = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
/** 용역 낙찰 목록 (공고명 검색) */
const OPERATION = "getScsbidListSttusServcPPSSrch";
/** 2026-11 기준 한 번에 7일까지만 조회된다 (31일은 거부) */
const WINDOW_DAYS = 7;
const PAGE_SIZE = 100;
/** 개발계정은 초당 요청 수가 적어 한 번에 하나씩, 사이를 두고 보낸다 */
const GAP_MS = 250;
const RETRY_WAIT_MS = 1_500;
/** 화면이 너무 오래 기다리지 않도록 이 시간이 지나면 남은 주는 건너뛴다 */
const TIME_BUDGET_MS = 140_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Award = {
  bidNo: string;
  title: string;
  org: string | null;
  amount: number;
  rate: number;
  participants: number | null;
  winner: string | null;
  date: string | null; // YYYY-MM-DD
  /** 낙찰방법 (입찰공고에서 따로 조회). undefined = 아직 조회 안 함, "" = 조회했지만 없음 */
  method?: string;
};

/** 경쟁이 거의 없던 공고 (참여 2곳 이하)는 3안 계산에서 뺀다 */
export const MIN_COMPETITORS = 3;
/** 3안 계산에 쓰는 최대 건수 */
export const MAX_RATES = 12;

/** 낙찰방법 글 → 계산 방식. 모르면 null */
export function modeOf(method: string | undefined | null): AwardMode | null {
  if (!method) return null;
  if (/협상/.test(method)) return "negotiation";
  if (/적격/.test(method)) return "qualified";
  return "price";
}

type ApiItem = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replaceAll(",", ""));
  return Number.isFinite(n) ? n : NaN;
};

/** API 한 건 → 필요한 값만. 금액·낙찰률이 이상하면 뺀다 */
export function toAward(item: ApiItem): Award | null {
  const bidNo = str(item.bidNtceNo);
  const title = str(item.bidNtceNm);
  const amount = num(item.sucsfbidAmt);
  const rate = num(item.sucsfbidRate);
  if (!bidNo || !title || !(amount > 0) || !(rate >= 40 && rate <= 120)) return null;
  const participants = num(item.prtcptCnum);
  const date = str(item.fnlSucsfDate) ?? str(item.rlOpengDt);
  return {
    bidNo: `${bidNo}-${str(item.bidNtceOrd) ?? "000"}`,
    title,
    org: str(item.dminsttNm),
    amount: Math.round(amount),
    rate,
    participants: Number.isFinite(participants) ? participants : null,
    winner: str(item.bidwinnrNm),
    date: date ? date.slice(0, 10) : null,
  };
}

/** 실제 원가 용역인가. '원가' 글자만 들어간 공고(예: 양주나리농원 가을개장, 원가정 복귀)는 뺀다 */
export const isCostWork = (title: string) =>
  /원가s*(계산|조사|산정|재산정|분석|검증|정산|산출|용역|심사)|(조성|사후|공사|제조|용역|요금|적정)s*원가/.test(title);

/** 한국 날짜 "YYYYMMDD" */
const kstDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replaceAll("-", "");

/**
 * 오늘부터 거꾸로 7일(날짜 기준)씩 나눈 조회 기간. 나라장터는 시각이 아니라 날짜로 7일을 센다
 * (11/11 18:00 ~ 11/18 18:00 은 8일에 걸쳐 '입력범위값 초과').
 */
export function weekWindows(now: Date, days: number) {
  const out: { begin: string; end: string }[] = [];
  for (let back = 0; back < days; back += WINDOW_DAYS) {
    const end = new Date(now.getTime() - back * 86_400_000);
    const begin = new Date(end.getTime() - (WINDOW_DAYS - 1) * 86_400_000);
    out.push({ begin: `${kstDay(begin)}0000`, end: `${kstDay(end)}2359` });
  }
  return out;
}

async function fetchWindow(key: string, keyword: string, begin: string, end: string): Promise<Award[]> {
  const serviceKey = key.includes("%") ? key : encodeURIComponent(key);
  const out: Award[] = [];
  for (let page = 1; page <= 5; page++) {
    const params = new URLSearchParams({
      type: "json",
      numOfRows: String(PAGE_SIZE),
      pageNo: String(page),
      inqryDiv: "1",
      inqryBgnDt: begin,
      inqryEndDt: end,
      bidNtceNm: keyword,
    });
    let got: { items: ApiItem[]; total: number } | null = null;
    for (let attempt = 0; !got; attempt++) {
      const res = await fetch(`${BASE_URL}/${OPERATION}?serviceKey=${serviceKey}&${params}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      try {
        got = parseResponse(await res.text());
      } catch (e) {
        // 초당 요청 제한에 걸리면 잠깐 쉬고 두 번까지 다시 보낸다
        if (attempt < 2 && e instanceof Error && e.message.includes("초당")) await sleep(RETRY_WAIT_MS * (attempt + 1));
        else throw e;
      }
      await sleep(GAP_MS);
    }
    const { items, total } = got;
    out.push(...items.flatMap((i) => toAward(i) ?? []).filter((a) => isCostWork(a.title)));
    if (page * PAGE_SIZE >= total) break;
  }
  return out;
}

/** 용역 입찰공고를 공고번호로 찾아 낙찰방법을 얻는다 (입찰공고정보서비스, inqryDiv=2) */
async function lookupMethod(bidNo: string): Promise<string> {
  const [no] = bidNo.split("-");
  for (let attempt = 0; ; attempt++) {
    try {
      const { items } = await callApi("getBidPblancListInfoServc02", { inqryDiv: "2", bidNtceNo: no, numOfRows: "5", pageNo: "1" });
      const hit = items.find((i) => typeof i.sucsfbidMthdNm === "string" && i.sucsfbidMthdNm.trim());
      return hit ? String(hit.sucsfbidMthdNm).trim() : "";
    } catch (e) {
      if (attempt < 2 && e instanceof Error && e.message.includes("초당")) await sleep(RETRY_WAIT_MS * (attempt + 1));
      else throw e;
    }
  }
}

/**
 * 아직 낙찰방법을 모르는 결과만 하나씩 조회해 채운다. deadline(ms 시각)이 지나면 멈추고,
 * 남은 것은 다음에 채운다. 바뀐 배열을 돌려준다.
 */
export async function fillMethods(awards: Award[], deadline: number): Promise<Award[]> {
  const out = [...awards];
  for (let i = 0; i < out.length; i++) {
    if (out[i].method !== undefined) continue;
    if (Date.now() > deadline) break;
    try {
      out[i] = { ...out[i], method: await lookupMethod(out[i].bidNo) };
    } catch {
      // 이번에 못 찾으면 다음에 다시 찾는다
    }
    await sleep(GAP_MS);
  }
  return out;
}

/** 최근 days일 동안 공고명에 keyword가 들어간 용역 낙찰 결과. 몇 주가 실패해도 나머지는 돌려준다 */
export async function fetchAwards(keyword: string, days: number, now = new Date()): Promise<{ awards: Award[]; failedWeeks: number }> {
  const key = process.env.BID_API_KEY;
  if (!key) throw new Error("BID_API_KEY가 설정되지 않았습니다.");
  const windows = weekWindows(now, days);
  const awards: Award[] = [];
  let failedWeeks = 0;
  let firstError = "";
  const started = Date.now();
  for (const w of windows) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      failedWeeks++;
      firstError ||= "시간 초과";
      continue;
    }
    try {
      awards.push(...(await fetchWindow(key, keyword, w.begin, w.end)));
    } catch (e) {
      failedWeeks++;
      firstError ||= e instanceof Error ? e.message : String(e);
    }
  }
  if (awards.length === 0 && failedWeeks === windows.length) throw new Error(`나라장터 낙찰정보를 받지 못했습니다: ${firstError}`);
  // 같은 공고가 두 번 오는 경우를 뺀다
  const seen = new Set<string>();
  return { awards: awards.filter((a) => (seen.has(a.bidNo) ? false : (seen.add(a.bidNo), true))), failedWeeks };
}

const norm = (s: string | null) => (s ?? "").replace(/\s|\(.*?\)|㈜|주식회사/g, "");

/** 공고명에서 연도·차수·괄호 말을 빼서 '같은 용역'을 알아보기 쉽게 */
export const titleCore = (t: string) =>
  t
    .replace(/\[.*?\]|\(.*?\)/g, " ")
    .replace(/\d{4}\s*년도?|제?\s*\d+\s*차|재공고|긴급/g, " ")
    .replace(/\s+/g, "");

/** use: 3안 계산에 씀. skip: 빼는 이유 */
export type Similar = Award & { sameOrg: boolean; sameWork: boolean; use: boolean; skip: string | null };

/**
 * 계산기에 쓸 비슷한 낙찰 결과.
 * - 같은 발주기관이거나 공고명이 거의 같은 지난 용역은 금액과 관계없이 넣는다
 * - 그 밖에는 낙찰금액이 기준금액의 40%~160% 안인 원가 용역만 넣는다
 */
export function pickSimilar(
  awards: Award[],
  notice: { title: string; org: string | null; base: number | null; bidNo?: string | null; mode?: AwardMode | null },
): Similar[] {
  const org = norm(notice.org);
  const core = titleCore(notice.title);
  const base = notice.base && notice.base > 0 ? notice.base : null;
  return awards
    .filter((a) => !notice.bidNo || !a.bidNo.startsWith(notice.bidNo))
    .map((a) => {
      const sameOrg = !!org && norm(a.org) === org;
      const sameWork = core.length >= 6 && titleCore(a.title) === core;
      const mode = modeOf(a.method);
      const skip =
        a.participants !== null && a.participants < MIN_COMPETITORS
          ? `경쟁 적음 (${a.participants}곳 참여)`
          : notice.mode && mode && mode !== notice.mode
            ? `다른 방식 (${MODE_LABEL[mode]})`
            : null;
      return { ...a, sameOrg, sameWork, use: skip === null, skip };
    })
    .filter((a) => a.sameOrg || a.sameWork || (base !== null && a.amount >= base * 0.4 && a.amount <= base * 1.6) || base === null)
    .sort(
      (a, b) =>
        Number(b.use) - Number(a.use) ||
        Number(b.sameWork) - Number(a.sameWork) ||
        Number(b.sameOrg) - Number(a.sameOrg) ||
        (b.date ?? "").localeCompare(a.date ?? ""),
    )
    .map((a, i, all) => (a.use && all.slice(0, i).filter((x) => x.use).length >= MAX_RATES ? { ...a, use: false, skip: "12건 초과" } : a));
}

const MODE_LABEL: Record<AwardMode, string> = { negotiation: "협상", qualified: "적격심사", price: "최저가 등" };

/** 예전에 받은 결과에 새로 받은 결과를 합친다 (같은 공고는 새 것으로). days일보다 오래된 것은 뺀다 */
export function mergeAwards(old: Award[], fresh: Award[], days: number, now = new Date()): Award[] {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const map = new Map<string, Award>();
  // 새로 받은 결과에는 낙찰방법이 없으므로 예전에 찾아 둔 값을 이어 쓴다
  for (const a of [...old, ...fresh]) map.set(a.bidNo, { ...a, method: a.method ?? map.get(a.bidNo)?.method });
  return [...map.values()].filter((a) => !a.date || a.date >= cutoff);
}
