/** 달력 한 칸. 그 달이 아닌 앞뒤 빈칸은 null */
export type DayCell = { date: string; day: number } | null;

/** 일요일로 시작하는 주 단위 달력 칸. 예: 2026년 11월 → 5주 */
export function monthGrid(year: number, month: number): DayCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const cells: DayCell[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push({ date: `${year}-${mm}-${String(d).padStart(2, "0")}`, day: d });
  while (cells.length % 7) cells.push(null);
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
