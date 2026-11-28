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
  plainResult,
  resultText,
  safeFileName,
  summaryEndpoint,
  summaryPrompt,
  SUMMARY_DAILY_LIMIT,
  SUMMARY_PLAN,
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

describe("공고 요약은 가장 좁은 권한으로", () => {
  it("읽기만 준다 (공고문은 누가 올렸는지 모르는 글이다)", () => {
    expect(SUMMARY_PLAN.tools).toEqual(["Read"]);
  });

  it("Bash·쓰기·웹·스킬은 주지 않는다", () => {
    for (const t of ["Bash", "Write", "Edit", "WebFetch", "WebSearch", "Skill"]) {
      expect(SUMMARY_PLAN.tools).not.toContain(t);
    }
  });

  it("지시문은 서버가 준 글을 그대로 쓴다", () => {
    const prompt = summaryPrompt({
      instructions: "서버가 준 지시문",
      title: "○○시 원가계산 용역",
      texts: [{ name: "공고문.hwp", body: "본문" }],
      pdfs: [{ name: "과업지시서.pdf", url: "https://www.g2b.go.kr/a.pdf" }],
    });
    expect(prompt.startsWith("서버가 준 지시문")).toBe(true);
    expect(prompt).toContain("○○시 원가계산 용역");
    expect(prompt).toContain("공고문.hwp, 과업지시서.pdf");
  });

  it("첨부가 없어도 지시문을 만들다 터지지 않는다", () => {
    expect(() => summaryPrompt({ instructions: "지시", title: "제목" })).not.toThrow();
  });
});

describe("첨부 이름으로 파일을 만들 때", () => {
  it("경로를 벗어나는 글자를 지운다", () => {
    expect(safeFileName("../../etc/passwd")).not.toContain("/");
    expect(safeFileName("../../etc/passwd").startsWith(".")).toBe(false);
    expect(safeFileName("공고문.hwp")).toBe("공고문.hwp");
  });

  it("이름이 비면 기본 이름을 쓴다", () => {
    expect(safeFileName("")).toBe("문서");
    expect(safeFileName(null)).toBe("문서");
  });
});

describe("요약 본문만 꺼내기", () => {
  it("사용량 줄을 붙이지 않는다 (DB 에 그대로 저장되므로)", () => {
    const r = plainResult(JSON.stringify({ result: "사업 개요:\n- 발주기관 ○○시", usage: { input_tokens: 9000, output_tokens: 500 } }));
    expect(r.text).toBe("사업 개요:\n- 발주기관 ○○시");
    expect(r.text).not.toContain("입력");
    expect(r.error).toBe(null);
  });

  it("빈 결과는 실패로 본다", () => {
    expect(plainResult(JSON.stringify({ result: "   " })).text).toBe(null);
    expect(plainResult(JSON.stringify({ result: "   " })).error).toContain("비어 있");
  });

  it("실패와 깨진 출력에는 이유가 있다", () => {
    expect(plainResult(JSON.stringify({ is_error: true, result: "거절" })).error).toBe("거절");
    expect(plainResult("json 아님").error).toContain("읽지 못");
  });
});
