import "server-only";
import { parseXml, type Item } from "./d2b-api";

/**
 * 공공데이터포털(apis.data.go.kr) XML API 호출. 나라장터와 같은 BID_API_KEY(일반 인증키)를 쓴다.
 * 기관별 API마다 공공데이터포털에서 활용신청이 되어 있어야 한다.
 */
export async function callDataGoKr(url: string, params: Record<string, string>, label: string) {
  const key = process.env.BID_API_KEY;
  if (!key) throw new Error("BID_API_KEY가 설정되지 않았습니다.");
  const serviceKey = key.includes("%") ? key : encodeURIComponent(key);
  const res = await fetch(`${url}?serviceKey=${serviceKey}&${new URLSearchParams(params)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return parseXml(await res.text(), label);
}

/** 여러 쪽으로 나뉜 목록을 모두 받는다 (maxPages 까지) */
export async function fetchPages(
  load: (pageNo: number) => Promise<{ items: Item[]; total: number }>,
  pageSize: number,
  maxPages: number,
): Promise<Item[]> {
  const all: Item[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { items, total } = await load(page);
    all.push(...items);
    if (items.length < pageSize || all.length >= total) break;
  }
  return all;
}

/** "2026-11-20 10:00", "202611201000", "20261120" 등 (한국 시간) → ISO. 날짜만 있으면 dayTime 시각으로 둔다 */
export function agencyDate(v: string | undefined, dayTime = "00:00:00"): string | null {
  const s = (v ?? "").trim();
  const m = s.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?:[ T]?(\d{2}):?(\d{2})(?::?(\d{2}))?)?/);
  if (!m) return null;
  const time = m[4] ? `${m[4]}:${m[5]}:${m[6] ?? "00"}` : dayTime;
  return `${m[1]}-${m[2]}-${m[3]}T${time}+09:00`;
}

export function agencyPrice(v: string | undefined): number | null {
  const n = Number(String(v ?? "").replaceAll(",", ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** 빈 값·숫자 코드만 있는 값은 화면에 보여 줄 이름이 아니므로 버린다 */
export const label = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s && !/^\d+$/.test(s) ? s : null;
};
