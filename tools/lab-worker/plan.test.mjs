import { describe, expect, it } from "vitest";
import {
  APP_URL_DEFAULT,
  buildArgs,
  clip,
  DAILY_LIMIT,
  folderName,
  PLAN,
  planFor,
  POLL_MS,
  resultText,
  summaryEndpoint,
  SUMMARY_DAILY_LIMIT,
  usageLine,
} from "./plan.mjs";

describe("연구소 워커 설정", () => {
  it("연구원마다 모델이 설계대로 갈린다", () => {
    expect(PLAN.cost.model).toBe("opus");
    expect(PLAN.scout.model).toBe("haiku");
    expect(PLAN.content.model).toBe("sonnet");
  });

  it("아무도 Bash 를 쓰지 못한다", () => {
    for (const p of Object.values(PLAN)) expect(p.tools).not.toContain("Bash");
  });

  it("웹을 쓰는 연구원은 공고 감시와 원가 용역뿐이다", () => {
    const web = Object.entries(PLAN)
      .filter(([, p]) => p.tools.includes("WebSearch"))
      .map(([id]) => id)
      .sort();
    expect(web).toEqual(["cost", "scout"]);
  });

  it("연구원은 모두 사용자가 만들어 둔 스킬을 쓸 수 있다", () => {
    for (const [id, p] of Object.entries(PLAN)) {
      expect(p.tools, id).toContain("Skill");
    }
  });

  it("모르는 연구원은 가장 좁은 설정으로 돈다", () => {
    const p = planFor("없는사람");
    expect(p.tools).toEqual(["Read", "Glob", "Grep"]);
  });

  it("명령 인자에 Bash 금지와 비대화형이 들어간다", () => {
    const args = buildArgs({ researcher: "scout", title: "공고 찾아줘" });
    expect(args[0]).toBe("-p");
    expect(args[1]).toBe("공고 찾아줘");
    expect(args).toContain("--disallowedTools");
    expect(args[args.indexOf("--disallowedTools") + 1]).toBe("Bash");
    expect(args[args.indexOf("--model") + 1]).toBe("haiku");
  });

  it("결과 json 에서 본문만 꺼낸다", () => {
    expect(resultText(JSON.stringify({ result: "다 했어요", is_error: false }))).toBe("다 했어요");
  });

  it("실패한 결과는 실패라고 적는다", () => {
    expect(resultText(JSON.stringify({ result: "Not logged in", is_error: true }))).toContain("실패:");
  });

  it("json 이 아니면 그대로 적는다", () => {
    expect(resultText("그냥 글")).toBe("그냥 글");
  });

  it("너무 긴 결과는 자른다", () => {
    expect(clip("가".repeat(5000)).endsWith("…(생략)")).toBe(true);
  });

  it("폴더 이름에 경로 글자가 끼지 못한다", () => {
    expect(folderName("cost")).toBe("cost");
    expect(folderName("../../etc")).toBe("unknown");
  });
});

describe("쉬는 간격과 상한", () => {
  it("쉴 때도 3초마다 본다 (늘려서 기다리게 하지 않는다)", () => {
    expect(POLL_MS).toBe(3000);
  });

  it("하루 상한이 있다", () => {
    expect(DAILY_LIMIT).toBeGreaterThan(0);
    expect(DAILY_LIMIT).toBeLessThanOrEqual(100);
  });
});

describe("건별로 쓴 양", () => {
  it("결과 끝에 입력·출력·걸린 시간을 붙인다", () => {
    const line = usageLine({ usage: { input_tokens: 1200, cache_read_input_tokens: 300, output_tokens: 450 }, duration_ms: 23000 });
    expect(line).toContain("입력 1.5k");
    expect(line).toContain("출력 450");
    expect(line).toContain("23초");
  });

  it("쓴 양을 모르면 아무것도 붙이지 않는다", () => {
    expect(usageLine({})).toBe("");
    expect(usageLine({ usage: { input_tokens: 0, output_tokens: 0 } })).toBe("");
  });

  it("본문 뒤에 이어 붙는다", () => {
    const out = resultText(JSON.stringify({ result: "다 했어요", usage: { input_tokens: 2000, output_tokens: 100 } }));
    expect(out.startsWith("다 했어요")).toBe(true);
    expect(out).toContain("입력 2.0k");
  });
});

describe("공고 요약 적체 풀기", () => {
  it("설정에 주소가 없으면 기본 주소를 쓴다", () => {
    expect(summaryEndpoint(undefined)).toBe(`${APP_URL_DEFAULT}/api/lab/summarize`);
    expect(summaryEndpoint("")).toBe(`${APP_URL_DEFAULT}/api/lab/summarize`);
  });

  it("주소 뒤에 붙은 / 는 떼고 만든다", () => {
    expect(summaryEndpoint("https://example.com///")).toBe("https://example.com/api/lab/summarize");
  });

  it("하루 상한이 있다 (요약 1건마다 서버 API 로 돈이 나가므로)", () => {
    expect(SUMMARY_DAILY_LIMIT).toBeGreaterThan(0);
    expect(SUMMARY_DAILY_LIMIT).toBeLessThanOrEqual(50);
  });
});
