// 하루 패턴(일과표·주간 패턴)에 그릴 조각 계산. 순수 함수.
import { seoulDayRange, type BabyLog, type CareKind } from "./care";

const MIN = 60_000;
export const DAY_MIN = 24 * 60;
/** 시각만 있는 기록(분유·기저귀 등)도 보이도록 그리는 최소 폭(분) */
export const MIN_WIDTH = 6;

export type Segment = { id: string; kind: CareKind; start: number; end: number }; // 그날 0시부터 분

/**
 * 그날(한국 시간)에 걸친 기록을 0~1440분 조각으로. 자정을 넘긴 잠은 그날 몫만, 자는 중이면 지금까지.
 * kinds가 있으면 그 종류만.
 */
export function daySegments(logs: BabyLog[], day: string, now: number, kinds?: CareKind[]): Segment[] {
  const { start, end } = seoulDayRange(day);
  const s0 = Date.parse(start);
  const s1 = Date.parse(end);
  const out: Segment[] = [];
  for (const l of logs) {
    if (kinds && !kinds.includes(l.kind)) continue;
    const a = Date.parse(l.started_at);
    let b = l.ended_at ? Date.parse(l.ended_at) : l.kind === "sleep" ? Math.max(a, now) : a;
    if (b - a < MIN_WIDTH * MIN) b = a + MIN_WIDTH * MIN;
    if (b <= s0 || a >= s1) continue;
    out.push({
      id: l.id,
      kind: l.kind,
      start: Math.max(0, (a - s0) / MIN),
      end: Math.min(DAY_MIN, (b - s0) / MIN),
    });
  }
  // 긴 조각(잠)을 먼저 그려 짧은 조각이 위에 보이게
  return out.sort((x, y) => y.end - y.start - (x.end - x.start));
}

/** 날짜 n일 이동 (YYYY-MM-DD) */
export function shiftDay(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 화면 주소의 종류 목록(k=formula,diaper) → 아는 종류만. 비었으면 기본값 */
export function parseKinds(raw: string | undefined, all: CareKind[], fallback: CareKind[]): CareKind[] {
  if (raw === undefined) return fallback;
  const set = new Set(raw.split(",").filter(Boolean));
  return all.filter((k) => set.has(k));
}
