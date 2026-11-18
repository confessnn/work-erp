import { describe, expect, it } from "vitest";
import { chunks, parseNotionId } from "./notion";
import { perSourceMax, resultText } from "./run";
import { contentTelegram } from "./telegram";
import { normalizeHandle, toPost } from "./x-api";

describe("normalizeHandle", () => {
  it("여러 모양의 입력", () => {
    expect(normalizeHandle("@sama")).toBe("sama");
    expect(normalizeHandle("https://x.com/levelsio/status/123")).toBe("levelsio");
    expect(normalizeHandle("https://twitter.com/Some_One?s=20")).toBe("Some_One");
    expect(normalizeHandle("한글")).toBeNull();
    expect(normalizeHandle("abcdefghijklmnop")).toBeNull();
  });
});

it("toPost: 긴 글(note_tweet)과 반응 수", () => {
  const p = toPost(
    { id: "1", text: "짧은…", note_tweet: { text: "긴 본문" }, lang: "ko", created_at: "2026-11-18T00:00:00.000Z", public_metrics: { like_count: 3, retweet_count: 1, quote_count: 2, reply_count: 4, impression_count: 99 } },
    "abc",
  );
  expect(p).toEqual({ id: "1", handle: "abc", text: "긴 본문", lang: "ko", posted_at: "2026-11-18T00:00:00.000Z", likes: 3, reposts: 3, replies: 4, views: 99 });
});

it("parseNotionId", () => {
  expect(parseNotionId("https://www.notion.so/myspace/abc-1234567890abcdef1234567890abcdef")).toBe("1234567890abcdef1234567890abcdef");
  expect(parseNotionId("https://www.notion.so/1234567890abcdef1234567890abcdef?pvs=4")).toBe("1234567890abcdef1234567890abcdef");
  expect(parseNotionId("12345678-90ab-cdef-1234-567890abcdef")).toBe("1234567890abcdef1234567890abcdef");
  expect(parseNotionId("nope")).toBeNull();
});

it("chunks", () => {
  expect(chunks("a".repeat(4000)).map((c) => c.length)).toEqual([1900, 1900, 200]);
  expect(chunks("")).toEqual([""]);
});

it("perSourceMax: 처음엔 5개, 예산 안에서", () => {
  expect(perSourceMax(true, 100)).toBe(5);
  expect(perSourceMax(false, 100)).toBe(20);
  expect(perSourceMax(false, 7)).toBe(7);
});

it("텔레그램 문구와 결과 한 줄", () => {
  const r = {
    fetched: 10,
    added: 8,
    analyzed: 8,
    synced: 8,
    problems: [],
    top: [{ id: "9", handle: "abc", text: "t", posted_at: null, likes: 1, reposts: 0, views: null, field: "AI", summary: "요약 <b>", translation: null, idea: "아이디어", idea_score: 4 }],
  };
  const m = contentTelegram(r);
  expect(m.html).toContain("새 글 8개");
  expect(m.html).toContain("★★★★ [AI] 요약 &lt;b&gt;");
  expect(m.html).toContain('href="https://x.com/abc/status/9"');
  expect(resultText({ ...r, problems: ["노션: 실패"] })).toBe("받은 글 10개(새 글 8) · AI 정리 8 · 노션 8 · 확인할 점: 노션: 실패");
});
