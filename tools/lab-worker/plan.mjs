// 연구원마다 어떤 모델·효율·도구로 Claude 를 돌릴지. 순수 함수만 둔다 (plan.test.mjs 가 검사).

/**
 * 연구원별 설정.
 * - model/effort: 처음에 세운 모델 분리 설계 그대로. 돈이 걸린 판단과 코드는 opus,
 *   수집·분류는 haiku, 양식 있는 문서 생산은 sonnet.
 * - tools: 그 연구원이 쓸 수 있는 도구만 켠다. Bash 는 아무도 안 준다 (웹에서 들어온
 *   문장을 맥에서 실행하는 구조라, 처음에는 좁게 두고 필요해지면 넓힌다).
 */
export const PLAN = {
  chief: { model: "opus", effort: "high", tools: ["Read", "Glob", "Grep", "Write", "Edit"] },
  scout: { model: "haiku", effort: "medium", tools: ["Read", "Glob", "Grep", "Write", "WebSearch", "WebFetch"] },
  cost: { model: "opus", effort: "high", tools: ["Read", "Glob", "Grep", "Write", "Edit", "WebSearch", "WebFetch"] },
  dev: { model: "opus", effort: "high", tools: ["Read", "Glob", "Grep", "Write", "Edit"] },
  content: { model: "sonnet", effort: "medium", tools: ["Read", "Glob", "Grep", "Write", "Edit"] },
  spare: { model: "sonnet", effort: "medium", tools: ["Read", "Glob", "Grep", "Write", "Edit"] },
};

/** 모르는 연구원이 와도 멈추지 않게 가장 좁은 설정으로 */
export const FALLBACK = { model: "sonnet", effort: "medium", tools: ["Read", "Glob", "Grep"] };

export const planFor = (researcher) => PLAN[researcher] ?? FALLBACK;

/** 한 번에 쓸 수 있는 시간 (밀리초). 넘으면 끊고 '시간이 넘었다'를 결과로 적는다 */
export const TIMEOUT_MS = 15 * 60 * 1000;

/** 하루에 처리할 수 있는 일 수. 넘으면 다음 날까지 쉰다 (플랜 한도를 한꺼번에 쓰지 않게) */
export const DAILY_LIMIT = 40;

/**
 * 할 일이 없을 때 쉬는 간격 (밀리초).
 * 3초마다 보내도 하루 2만 8천 번 × 수백 바이트라 Supabase 쪽 비용은 무시할 수준이고,
 * Claude 는 일이 있을 때만 돌므로 쉬는 동안 플랜 한도는 전혀 쓰지 않는다.
 * 그래서 간격을 늘려 기다리게 만들 이유가 없다.
 */
export const POLL_MS = 3000;

/**
 * claude 명령에 넘길 인자.
 * -p 로 비대화형, 결과는 json 으로 받아 result 만 꺼낸다.
 * 작업 폴더 밖은 건드리지 못하게 cwd 를 연구원 폴더로 두고 --add-dir 를 따로 주지 않는다.
 */
export function buildArgs(task, plan = planFor(task.researcher)) {
  return [
    "-p",
    task.title,
    "--model",
    plan.model,
    "--effort",
    plan.effort,
    "--output-format",
    "json",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    plan.tools.join(" "),
    "--disallowedTools",
    "Bash",
  ];
}

/** 결과가 너무 길면 뒤를 자른다 (보드 카드에 들어갈 만큼만) */
export function clip(text, max = 4000) {
  const t = (text ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}\n…(생략)` : t;
}

/** 1234 -> "1.2k" */
const short = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/**
 * 이 일에 얼마나 썼는지 한 줄. 보드 카드에서 바로 보이라고 결과 끝에 붙인다
 * (플랜 한도는 앱의 사용량 카드에서 전체를 보고, 여기서는 건별로 본다).
 */
export function usageLine(j) {
  const u = j?.usage;
  if (!u) return "";
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const out = u.output_tokens ?? 0;
  if (!input && !out) return "";
  const secs = j.duration_ms ? ` · ${Math.round(j.duration_ms / 1000)}초` : "";
  return `\n\n— 입력 ${short(input)} · 출력 ${short(out)}${secs}`;
}

/** claude --output-format json 의 출력에서 보드에 적을 한 덩어리를 꺼낸다 */
export function resultText(stdout) {
  try {
    const j = JSON.parse(stdout);
    if (j.is_error) return clip(`실패: ${j.result ?? "알 수 없는 오류"}`);
    return clip(j.result ?? "") + usageLine(j);
  } catch {
    return clip(stdout);
  }
}

/** 연구원 폴더 이름 (경로를 벗어나는 글자는 막는다) */
export function folderName(researcher) {
  return /^[a-z0-9_-]{1,40}$/.test(researcher) ? researcher : "unknown";
}
