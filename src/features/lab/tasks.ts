// 연구소 업무 지시 (supabase/migrations/20261128120000_lab_tasks.sql)

export type TaskState = "queued" | "running" | "review" | "done";

export type LabTask = {
  id: string;
  /** roster.ts 의 연구원 id */
  researcher: string;
  title: string;
  state: TaskState;
  /** 연구원이 적어 둔 결과 */
  result: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

/** DB에서 읽을 칸 */
export const TASK_COLUMNS = "id, researcher, title, state, result, started_at, finished_at, created_at, updated_at";

/** 보드 칸 차례 */
export const BOARD: TaskState[] = ["queued", "running", "review", "done"];

export const STATE_LABEL: Record<TaskState, string> = {
  queued: "맡긴 일",
  running: "진행 중",
  review: "확인 대기",
  done: "완료",
};

/** 아직 끝나지 않은 칸 (연구원 머리 위 숫자에 센다) */
export const OPEN_STATES: TaskState[] = ["queued", "running", "review"];

export const TITLE_MAX = 4000;

/** 지시 입력 정리: 줄바꿈은 살리고 앞뒤 공백만 떼어 4000자까지. 비면 null */
export function cleanInstruction(raw: string): string | null {
  const t = raw.replace(/\r\n/g, "\n").trim();
  return t ? t.slice(0, TITLE_MAX) : null;
}

/** 보드 칸별로 나눈다 (칸 안에서는 새 것이 위) */
export function groupByState(tasks: LabTask[]): Record<TaskState, LabTask[]> {
  const out: Record<TaskState, LabTask[]> = { queued: [], running: [], review: [], done: [] };
  for (const t of tasks) out[t.state].push(t);
  for (const s of BOARD) out[s].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return out;
}

/** 연구원 한 명 앞에 쌓인, 아직 안 끝난 일 수 */
export function openCount(tasks: LabTask[], researcher: string): number {
  return tasks.filter((t) => t.researcher === researcher && t.state !== "done").length;
}

/** 연구원별로 묶는다 */
export function byResearcher(tasks: LabTask[]): Map<string, LabTask[]> {
  const out = new Map<string, LabTask[]>();
  for (const t of tasks) {
    const list = out.get(t.researcher);
    if (list) list.push(t);
    else out.set(t.researcher, [t]);
  }
  return out;
}

/** 한 줄 미리보기 (카드에 넣을 제목) */
export function firstLine(title: string, max = 60): string {
  const line = title.split("\n")[0].trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}
