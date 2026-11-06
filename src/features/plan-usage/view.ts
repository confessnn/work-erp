export type UsageBar = { label: string; percent: number; reset: string; level: "normal" | "warn" | "high" };

const SEOUL = { timeZone: "Asia/Seoul" } as const;

const resetTime = (iso: string, withDay: boolean) =>
  new Date(iso).toLocaleString("ko-KR", {
    ...SEOUL,
    ...(withDay ? { weekday: "short" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
  });

/**
 * 한도 막대 하나. 값이 없으면 null.
 * 초기화 시각이 지났는데 새 값이 안 왔으면 예전 사용량이 남아 있는 것이므로 0%로 보여 준다.
 */
export function usageBar(label: string, percent: number | null, resetsAt: string | null, now: number, withDay: boolean): UsageBar | null {
  if (percent === null) return null;
  const expired = resetsAt !== null && Date.parse(resetsAt) <= now;
  const value = expired ? 0 : Math.min(100, Math.max(0, percent));
  return {
    label,
    percent: value,
    reset: expired ? "초기화됨" : resetsAt ? `${resetTime(resetsAt, withDay)}에 초기화` : "",
    level: value >= 90 ? "high" : value >= 70 ? "warn" : "normal",
  };
}

/** 값을 받은 시각 */
export const reportedLabel = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { ...SEOUL, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
