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

/** claude --output-format json 의 출력에서 보드에 적을 한 덩어리를 꺼낸다 */
export function resultText(stdout) {
  try {
    const j = JSON.parse(stdout);
    if (j.is_error) return clip(`실패: ${j.result ?? "알 수 없는 오류"}`);
    return clip(j.result ?? "");
  } catch {
    return clip(stdout);
  }
}

/** 연구원 폴더 이름 (경로를 벗어나는 글자는 막는다) */
export function folderName(researcher) {
  return /^[a-z0-9_-]{1,40}$/.test(researcher) ? researcher : "unknown";
}
