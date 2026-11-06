import { callApi } from "./g2b-api";
import type { BidFile } from "./types";

type ApiItem = Record<string, unknown>;

/** 공고 하나에 붙일 수 있는 첨부 개수 (ntceSpecFileNm1~10) */
const SPEC_FILES = 10;
/** 요약에 읽을 문서 수. 공고문·제안요청서·과업지시서·규격서면 충분하다 */
const MAX_DOCS = 4;

const WANTED = /공고|과업|제안요청|지시서|규격|RFP/i;
const SKIPPED = /특수조건|안내|서식|양식|서약|청렴|상생|성과공유|별지|보안/;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** API의 공고 행과 e발주 첨부 행 → 첨부 목록 */
export function listFiles(notice: ApiItem | undefined, eorder: ApiItem[]): BidFile[] {
  const files: BidFile[] = [];
  for (let i = 1; notice && i <= SPEC_FILES; i++) {
    const url = text(notice[`ntceSpecDocUrl${i}`]);
    if (url) files.push({ name: text(notice[`ntceSpecFileNm${i}`]) || `첨부 ${i}`, url });
  }
  for (const item of eorder) {
    const url = text(item.eorderAtchFileUrl);
    if (url) files.push({ name: text(item.eorderAtchFileNm) || text(item.eorderDocDivNm) || "e발주 첨부", url });
  }
  return files;
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "");
const isPdf = (name: string) => /\.pdf$/i.test(name);

/**
 * 요약에 읽을 문서를 고른다. 같은 이름이 한글·PDF로 함께 있으면 표까지 읽히는 PDF를 쓴다.
 * 공고문·과업 관련 이름이 없으면 안내·서식이 아닌 앞쪽 파일을 쓴다.
 */
export function pickDocs(files: BidFile[]): BidFile[] {
  const byStem = new Map<string, BidFile>();
  for (const f of files) {
    if (SKIPPED.test(f.name)) continue;
    const prev = byStem.get(stem(f.name));
    if (!prev || (isPdf(f.name) && !isPdf(prev.name))) byStem.set(stem(f.name), f);
  }
  const usable = [...byStem.values()];
  const wanted = usable.filter((f) => WANTED.test(f.name));
  return (wanted.length ? wanted : usable).slice(0, MAX_DOCS);
}

/** 공고번호로 첨부 목록을 조회한다 (일반 첨부 + e발주 제안요청서) */
export async function fetchNoticeFiles(bidNo: string, bidOrd: string): Promise<BidFile[]> {
  const params = { numOfRows: "20", pageNo: "1", inqryDiv: "2", bidNtceNo: bidNo };
  const [list, eorder] = await Promise.all([
    callApi("getBidPblancListInfoServc02", params),
    callApi("getBidPblancListInfoEorderAtchFileInfo02", params),
  ]);
  const sameOrd = (i: ApiItem) => text(i.bidNtceOrd) === bidOrd;
  return listFiles(list.items.find(sameOrd), eorder.items.filter(sameOrd));
}
