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

/** 간격패턴에서 고르는 묶음. merge: 이 분 안에 이어진 기록은 한 번으로 친다 (예: 분유 먹이고 30분 안에 조금 더) */
export const INTERVAL_GROUPS = [
  { key: "feed", label: "수유", kinds: ["formula", "breast", "pumped"], merge: 30 },
  { key: "diaper", label: "기저귀", kinds: ["diaper"], merge: 10 },
  { key: "poo", label: "대변", kinds: ["diaper"], merge: 10, pooOnly: true },
  { key: "sleep", label: "수면", kinds: ["sleep"], merge: 0 },
  { key: "pump", label: "유축", kinds: ["pump"], merge: 10 },
  { key: "medicine", label: "투약", kinds: ["medicine"], merge: 10 },
] as const satisfies readonly { key: string; label: string; kinds: readonly CareKind[]; merge: number; pooOnly?: boolean }[];
export type IntervalGroup = (typeof INTERVAL_GROUPS)[number];

export type Session = { at: string; ids: string[]; gap: number | null }; // gap: 앞 기록과의 간격(분)

/** 고른 묶음의 기록을 시간순으로 모아(가까운 것은 합쳐) 앞 기록과의 간격을 붙인다 */
export function sessions(logs: BabyLog[], group: IntervalGroup): Session[] {
  const pooOnly = "pooOnly" in group && group.pooOnly;
  const picked = logs
    .filter((l) => (group.kinds as readonly CareKind[]).includes(l.kind) && (!pooOnly || l.diaper === "poo" || l.diaper === "both"))
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const out: Session[] = [];
  let lastAt = 0;
  for (const l of picked) {
    const t = Date.parse(l.started_at);
    const prev = out[out.length - 1];
    if (prev && group.merge > 0 && t - lastAt <= group.merge * MIN) {
      prev.ids.push(l.id);
      lastAt = t;
      continue;
    }
    out.push({ at: l.started_at, ids: [l.id], gap: prev ? Math.round((t - Date.parse(prev.at)) / MIN) : null });
    lastAt = t;
  }
  return out;
}

export type GapStats = { count: number; avg: number | null; min: number | null; max: number | null };

/** 그날(한국 시간) 시작한 기록들의 횟수와 간격 평균·최단·최장 */
export function dayGapStats(list: Session[], day: string): GapStats {
  const { start, end } = seoulDayRange(day);
  const inDay = list.filter((s) => s.at >= start && s.at < end);
  const gaps = inDay.map((s) => s.gap).filter((g): g is number => g !== null);
  return {
    count: inDay.length,
    avg: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    min: gaps.length ? Math.min(...gaps) : null,
    max: gaps.length ? Math.max(...gaps) : null,
  };
}
