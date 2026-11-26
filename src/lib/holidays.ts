// 대한민국 공휴일 (대체공휴일·선거일 같은 임시공휴일 포함).
// 자료: @hyunbinseo/holidays-kr — 우주항공청 월력요항(관보) 기준. 새해 자료가 나오면 패키지만 올리면 된다.
// 서버(페이지)에서만 부른다. 화면 컴포넌트는 holiday-label.ts만 쓴다.
import { getHolidayPreset } from "@hyunbinseo/holidays-kr";

import type { Holidays } from "./holiday-label";

export type { Holidays } from "./holiday-label";
export { shortHoliday } from "./holiday-label";

/** 1년치 표에서 그달 것만 골라 이름을 합친다 (하루에 둘이면 "A·B") */
export function pickMonth(preset: Readonly<Record<string, readonly string[]>>, year: number, month: number): Holidays {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const out: Holidays = {};
  for (const [date, names] of Object.entries(preset)) if (date.startsWith(prefix)) out[date] = names.join("·");
  return out;
}

/** 1년치 표에서 기간([start, next)) 것만 골라 이름을 합친다 */
export function pickBetween(preset: Readonly<Record<string, readonly string[]>>, start: string, next: string): Holidays {
  const out: Holidays = {};
  for (const [date, names] of Object.entries(preset)) if (date >= start && date < next) out[date] = names.join("·");
  return out;
}

/** 그달 공휴일. 자료가 없는 해(아직 발표 전)면 빈 목록 — 달력은 그대로 보여 준다 */
export async function holidaysOfMonth(year: number, month: number): Promise<Holidays> {
  try {
    return pickMonth(await getHolidayPreset(String(year)), year, month);
  } catch {
    return {};
  }
}

/** 기간([start, next)) 안의 공휴일. 해를 걸치는 기간이면 두 해 자료를 합친다 */
export async function holidaysBetween(start: string, next: string): Promise<Holidays> {
  const out: Holidays = {};
  for (const y of new Set([start.slice(0, 4), next.slice(0, 4)])) {
    try {
      Object.assign(out, pickBetween(await getHolidayPreset(y), start, next));
    } catch {
      // 아직 자료가 없는 해는 건너뛴다 (달력은 그대로 보여 준다)
    }
  }
  return out;
}
