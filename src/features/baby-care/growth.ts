// 성장 백분위·성장 곡선·수유 기준량 계산 (순수 함수). 기준표는 who-lms.ts (WHO 성장 기준, 0~730일).
import { LENGTH_FOR_AGE, WEIGHT_FOR_AGE, type Lms } from "./who-lms";

export type Sex = "male" | "female";
export type Measure = "weight" | "length";

const DAY = 86_400_000;
export const MAX_DAY = 730;
/** 3·97 백분위에 해당하는 z 값 */
export const Z97 = 1.880794;

const table = (m: Measure, sex: Sex) => (m === "weight" ? WEIGHT_FOR_AGE : LENGTH_FOR_AGE)[sex];

/** 날짜(YYYY-MM-DD) 사이 일수 */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

/**
 * 비교에 쓰는 나이(일). 37주 전에 태어난 이른둥이는 40주 기준으로 덜 자란 날만큼 빼서 '교정 나이'로 비교한다
 * (예: 36주 4일 → 24일을 뺀다). 교정 나이가 0일보다 작으면(예정일 전) null.
 */
export function compareAge(birthDate: string, date: string, gestWeeks: number | null, gestDays: number | null = null) {
  const age = daysBetween(birthDate, date);
  const gest = gestWeeks ? gestWeeks * 7 + (gestDays ?? 0) : null;
  const shift = gest !== null && gest < 37 * 7 ? 40 * 7 - gest : 0;
  const d = age - shift;
  return { age, corrected: shift > 0, days: d >= 0 && d <= MAX_DAY ? d : null };
}

/** LMS → 값에 해당하는 z */
function rawZ([l, m, s]: Lms, x: number) {
  return l === 0 ? Math.log(x / m) / s : (Math.pow(x / m, l) - 1) / (l * s);
}
/** z → LMS 값 */
export function valueAt([l, m, s]: Lms, z: number) {
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

/** WHO 방식 z 점수 (몸무게는 ±3 바깥을 WHO 규칙대로 고쳐 계산) */
export function zScore(measure: Measure, lms: Lms, x: number) {
  const z = rawZ(lms, x);
  if (measure !== "weight" || Math.abs(z) <= 3) return z;
  if (z > 3) {
    const sd3 = valueAt(lms, 3);
    return 3 + (x - sd3) / (sd3 - valueAt(lms, 2));
  }
  const sd3 = valueAt(lms, -3);
  return -3 + (x - sd3) / (valueAt(lms, -2) - sd3);
}

/** 표준정규분포 누적확률 (Abramowitz-Stegun 26.2.17, 오차 < 1e-7) */
export function normCdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export type Assessment = { z: number; percentile: number; median: number };

/** 그 나이(일) 같은 성별 아이들과 비교: z, 백분위(0~100), 중앙값 */
export function assess(measure: Measure, sex: Sex, days: number, x: number): Assessment | null {
  const lms = table(measure, sex)[days];
  if (!lms || !(x > 0)) return null;
  const z = zScore(measure, lms, x);
  return { z, percentile: normCdf(z) * 100, median: valueAt(lms, 0) };
}

/** "15백분위", 아주 작거나 크면 "0.1 미만" */
export function percentileLabel(p: number) {
  if (p < 0.1) return "0.1백분위 미만";
  if (p > 99.9) return "99.9백분위 초과";
  return `${p < 1 || p > 99 ? p.toFixed(1) : Math.round(p)}백분위`;
}

export type CurvePoint = { day: number; p3: number; p50: number; p97: number };

/** 성장 곡선 3·50·97 백분위 (from~to일, step일 간격) */
export function curve(measure: Measure, sex: Sex, from: number, to: number, step = 1): CurvePoint[] {
  const t = table(measure, sex);
  const out: CurvePoint[] = [];
  for (let d = Math.max(0, from); d <= Math.min(to, MAX_DAY); d += step) {
    out.push({ day: d, p3: valueAt(t[d], -Z97), p50: valueAt(t[d], 0), p97: valueAt(t[d], Z97) });
  }
  return out;
}

/** 분유 하루 기준량: 체중 1kg당 약 150ml (10ml 단위 반올림). 참고용 */
export const ML_PER_KG = 150;
export const dailyFeedGuide = (weightKg: number) => Math.round((weightKg * ML_PER_KG) / 10) * 10;
