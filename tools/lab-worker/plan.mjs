// 연구원마다 어떤 모델·효율·도구로 Claude 를 돌릴지. 순수 함수만 둔다 (plan.test.mjs 가 검사).

/**
 * 연구원별 설정.
 * - model/effort: 처음에 세운 모델 분리 설계 그대로. 돈이 걸린 판단과 코드는 opus,
 *   수집·분류는 haiku, 양식 있는 문서 생산은 sonnet.
 * - Skill: 사용자가 만들어 둔 스킬(원가 투찰가·견적서·회의록 등)을 연구원이 그대로 쓰게 한다.
 *   스킬은 계정에 붙어 있어 연구원 폴더에서도 보인다(실측). 도구를 늘려도 입력 토큰은
 *   거의 안 늘어난다 — 도구 1개와 6개 차이가 9토큰이었다.
 * - tools: 그 연구원이 쓸 수 있는 도구만 켠다. Bash 는 아무도 안 준다 (웹에서 들어온
 *   문장을 맥에서 실행하는 구조라, 처음에는 좁게 두고 필요해지면 넓힌다).
 */
export const PLAN = {
  chief: { model: "opus", effort: "high", tools: ["Read", "Glob", "Grep", "Write", "Edit", "Skill"] },
  scout: { model: "haiku", effort: "medium", tools: ["Read", "Glob", "Grep", "Write", "WebSearch", "WebFetch", "Skill"] },
  cost: { model: "opus", effort: "high", tools: ["Read", "Glob", "Grep", "Write", "Edit", "WebSearch", "WebFetch", "Skill"] },
  dev: { model: "opus", effort: "high", tools: ["Read", "Glob", "Grep", "Write", "Edit", "Skill"] },
  content: { model: "sonnet", effort: "medium", tools: ["Read", "Glob", "Grep", "Write", "Edit", "Skill"] },
  spare: { model: "sonnet", effort: "medium", tools: ["Read", "Glob", "Grep", "Write", "Edit", "Skill"] },
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

/**
 * 요약 적체 처리.
 *
 * 원가 공고 중 사람이 봐야 하는 것(판정 check·possible)은 많지 않은데(주 10건쯤),
 * 요약이 거의 비어 있다. 아침 크론이 Vercel 300초 제한 때문에 하루 한 건밖에
 * 못 하기 때문이다. 그래서 워커가 ERP 의 /api/lab/summarize 를 남은 수가 0이 될
 * 때까지 되부른다 — 라우트는 한 번에 한 건만 하고, 시간 제한이 없는 워커가 반복을 맡는다.
 *
 * 맡긴 일(보드)이 먼저다. 요약은 할 일이 없을 때만 하고, 하루 상한을 둔다
 * (요약 1건마다 서버의 ANTHROPIC_API_KEY 로 실제 돈이 나가므로).
 */
export const SUMMARY_DAILY_LIMIT = 10;

/**
 * 공고 요약 전용 설정.
 *
 * 공고문은 '누가 올렸는지 모르는 문서'다. 서버가 API 로 요약할 때는 도구가 하나도 없는
 * 호출이었으니, 맥으로 옮기면서 가장 좁게 둔다 — 읽기만. 쓰기·웹·스킬은 주지 않는다
 * (요약 결과는 stdout 으로 받으므로 파일을 쓸 필요가 없다).
 */
export const SUMMARY_PLAN = { model: "opus", effort: "medium", tools: ["Read"] };

/**
 * 요약 지시문. 지시문 본문(instructions)은 서버가 `summarize.ts` 에서 준 글을 그대로 쓴다 —
 * 요약 형식이 아침 메일과 공고 화면에 들어가므로 한 곳에서만 고쳐야 한다.
 */
export function summaryPrompt(notice) {
  const names = [...(notice.texts ?? []).map((t) => t.name), ...(notice.pdfs ?? []).map((f) => f.name)];
  return [
    notice.instructions,
    "",
    `공고명: ${notice.title}`,
    "",
    "이 폴더에 있는 파일을 모두 읽고 위 형식으로 설명해 주세요.",
    `읽을 파일: ${names.join(", ")}`,
    "PDF 가 10쪽을 넘으면 pages 를 나눠서 끝까지 읽어 주세요.",
  ].join("\n");
}

/** 첨부 이름이 그대로 파일 이름이 되므로, 경로를 벗어나는 글자를 지운다 */
export function safeFileName(name, fallback = "문서") {
  const base = String(name ?? "")
    .replace(/[/\\]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return base.slice(0, 120) || fallback;
}

/** 설정에 appUrl 이 없을 때 쓸 ERP 주소 (공개 주소라 저장소에 둬도 된다) */
export const APP_URL_DEFAULT = "https://work-erp-one.vercel.app";

/** 요약 라우트 주소. 뒤에 붙은 / 는 떼고 만든다 */
export function summaryEndpoint(appUrl) {
  return `${(appUrl || APP_URL_DEFAULT).replace(/\/+$/, "")}/api/lab/summarize`;
}

/**
 * 요약처럼 '본문만' 필요한 경우. 사용량 줄을 붙이지 않는다
 * (요약은 DB 에 그대로 저장돼 아침 메일·공고 화면에 나가므로 군더더기가 끼면 안 된다).
 */
export function plainResult(stdout) {
  try {
    const j = JSON.parse(stdout);
    if (j.is_error) return { text: null, error: clip(String(j.result ?? "알 수 없는 오류"), 300) };
    const text = String(j.result ?? "").trim();
    return text ? { text, error: null } : { text: null, error: "요약 결과가 비어 있습니다" };
  } catch {
    return { text: null, error: "claude 출력을 읽지 못했습니다" };
  }
}
