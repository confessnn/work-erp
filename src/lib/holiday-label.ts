// 공휴일 표시용 (화면에서도 쓰는 가벼운 부분). 자료 읽기는 holidays.ts (서버 전용)

/** 날짜(YYYY-MM-DD) → 공휴일 이름 ("설날", "대체공휴일(3ㆍ1절)") */
export type Holidays = Record<string, string>;

/** 달력 칸에 짧게: "대체공휴일(광복절)" → "대체공휴일" */
export const shortHoliday = (name: string) => name.replace(/\(.*\)/, "");
