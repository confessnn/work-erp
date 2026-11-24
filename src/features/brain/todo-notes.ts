// 대시보드 할 일 → 옵시디언 데일리 노트 ('ERP 기록/할 일/2026-11-24.md'). 날짜 하나가 노트 하나 (순수 함수)
import { digest, type ExportPlan } from "./export";

export type TodoRow = { id: string; title: string; due_date: string; done_at: string | null; created_at: string; note: string | null };

/** 내보내는 기간: 오늘 앞뒤로 이만큼 (오래된 노트는 마지막 모습 그대로 볼트에 남는다) */
export const TODO_DAYS_BACK = 30;
export const TODO_DAYS_AHEAD = 60;
/** 할 일 노트가 들어가는 폴더 (ERP 기록 폴더 안) */
export const TODO_FOLDER = "할 일";
/** brain_exports.series_key: 'todo:2026-11-24' */
export const todoKey = (day: string) => `todo:${day}`;

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const weekday = (day: string) => WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()];

/** 하루의 할 일 노트. 안 한 것 먼저, 넣은 순서대로. 메모는 들여쓴 줄로 */
export function todoNote(day: string, todos: TodoRow[]): string {
  const sorted = [...todos].sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || a.created_at.localeCompare(b.created_at));
  const done = sorted.filter((t) => t.done_at).length;
  const lines = [
    "---",
    "source: work-erp",
    "type: todos",
    `date: ${day}`,
    `done: ${done}`,
    `total: ${sorted.length}`,
    "tags:",
    "  - erp/할일",
    "---",
    `# ${day} (${weekday(day)}) 할 일`,
    "",
  ];
  if (!sorted.length) lines.push("할 일이 없어요.");
  for (const t of sorted) {
    lines.push(`- [${t.done_at ? "x" : " "}] ${t.title.replace(/\s+/g, " ").trim()}`);
    for (const n of (t.note ?? "").split("\n").map((s) => s.trim()).filter(Boolean)) lines.push(`\t- ${n}`);
  }
  lines.push("", "> [!info] ERP 대시보드의 할 일을 옮긴 노트예요", "> ERP에서 할 일을 바꾸면 덮어써요. 생각은 다른 노트에 쓰고 [[링크]]로 이어 주세요.", "");
  return lines.join("\n");
}

/**
 * 할 일 → 올릴 노트 목록. 기간 안의 날짜만.
 * 예전에 올렸는데 이제 할 일이 없는 날(지우거나 다른 날로 미룸)도 '할 일이 없어요'로 고친다.
 */
export function planTodoNotes(todos: TodoRow[], exportedKeys: string[], today: string): ExportPlan[] {
  const from = shift(today, -TODO_DAYS_BACK);
  const to = shift(today, TODO_DAYS_AHEAD);
  const inRange = (d: string) => d >= from && d <= to;
  const byDay = new Map<string, TodoRow[]>();
  for (const t of todos) if (inRange(t.due_date)) byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t]);
  for (const k of exportedKeys) {
    const day = k.startsWith("todo:") ? k.slice(5) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && inRange(day) && !byDay.has(day)) byDay.set(day, []);
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const content = todoNote(day, list);
      return { key: todoKey(day), fileName: `${day}.md`, content, digest: digest(content) };
    });
}

function shift(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
