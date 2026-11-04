export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export const hoursLabel = (h: number) => `${Number(h).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}시간`;

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-11-04" → "11/4 (수)" */
export function dateLabel(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${m}/${day} (${wd})`;
}

/** "13:30:00" → "13:30" */
export const timeLabel = (t: string | null) => (t ? t.slice(0, 5) : "");

/** 한국 시간 기준 오늘의 연·월 */
export function nowInSeoul() {
  const [y, m] = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).split("-").map(Number);
  return { year: y, month: m };
}

/** 한국 시간 기준 오늘 "YYYY-MM-DD" */
export const todayInSeoul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
