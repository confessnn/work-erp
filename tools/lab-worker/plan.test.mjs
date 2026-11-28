import { describe, expect, it } from "vitest";
import { buildArgs, clip, DAILY_LIMIT, folderName, nextWait, PLAN, planFor, resultText } from "./plan.mjs";

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

describe("쉴 때 아끼기", () => {
  it("방금 일했으면 바로 다시 보고, 조용하면 뜸해진다", () => {
    expect(nextWait(0)).toBe(3000);
    expect(nextWait(10)).toBe(10000);
    expect(nextWait(100)).toBe(30000);
  });

  it("쉬는 간격은 뒤로 갈수록 길어지기만 한다", () => {
    let prev = 0;
    for (const n of [0, 4, 5, 24, 25, 99]) {
      expect(nextWait(n)).toBeGreaterThanOrEqual(prev);
      prev = nextWait(n);
    }
  });

  it("하루 상한이 있다", () => {
    expect(DAILY_LIMIT).toBeGreaterThan(0);
    expect(DAILY_LIMIT).toBeLessThanOrEqual(100);
  });
});
