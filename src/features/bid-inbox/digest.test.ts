import { describe, expect, it } from "vitest";
import { buildDigest, fetchProblem, notifiedIds, type DigestNotice } from "./digest";

const notice = (over: Partial<DigestNotice> = {}): DigestNotice => ({
  id: "a",
  category: "cost",
  title: "원가계산 용역",
  verdict: "possible",
  verdict_reason: null,
  notice_org: "기관",
  presumed_price: 1000,
  closes_at: "2026-11-16T01:00:00Z",
  detail_url: "https://www.g2b.go.kr/x",
  summary: "요약",
  summary_error: null,
  ...over,
});

describe("buildDigest", () => {
  it("알릴 것이 없으면 메일을 만들지 않는다", () => {
    expect(buildDigest([], [])).toBeNull();
  });

  it("수신 문제만 있어도 메일을 만든다", () => {
    const mail = buildDigest([], ["오늘 공고 수신 기록이 없습니다."]);
    expect(mail?.subject).toBe("[공고 알림] 새 공고 0건 · 확인 필요 1건");
    expect(mail?.html).toContain("오늘 공고 수신 기록이 없습니다.");
  });

  it("마감일은 한국 시간으로 쓴다", () => {
    expect(buildDigest([notice()], [])?.html).toMatch(/11\. 16\..*10:00/);
  });

  it("요약 실패를 제목과 본문에 알린다", () => {
    const mail = buildDigest([notice({ summary: null, summary_error: "첨부 없음" })], []);
    expect(mail?.subject).toContain("확인 필요 1건");
    expect(mail?.html).toContain("요약 실패: 첨부 없음");
  });

  it("요약이 아직 안 된 원가 공고는 대기로 표시한다", () => {
    expect(buildDigest([notice({ summary: null })], [])?.html).toContain("요약 대기");
  });

  it("한일ENG 공고에는 요약 상태를 쓰지 않는다", () => {
    const html = buildDigest([notice({ category: "hanil", summary: null })], [])?.html;
    expect(html).toContain("한일ENG 1건");
    expect(html).not.toContain("요약 대기");
  });

  it("외부 문서에서 온 글의 HTML을 막는다", () => {
    const html = buildDigest([notice({ title: "<img src=x>", summary: "<script>alert(1)</script>" })], [])?.html;
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
  });

  it("웹 주소가 아니면 링크를 걸지 않는다", () => {
    expect(buildDigest([notice({ detail_url: "javascript:alert(1)" })], [])?.html).not.toContain("javascript:");
  });
});

describe("notifiedIds", () => {
  it("요약 대기 공고는 다음 메일에 다시 알린다", () => {
    const ids = notifiedIds([
      notice({ id: "done" }),
      notice({ id: "failed", summary: null, summary_error: "오류" }),
      notice({ id: "waiting", summary: null }),
      notice({ id: "hanil", category: "hanil", summary: null }),
    ]);
    expect(ids).toEqual(["done", "failed", "hanil"]);
  });
});

describe("fetchProblem", () => {
  const now = new Date("2026-11-07T00:30:00Z");

  it("정상 수신이면 문제가 없다", () => {
    expect(fetchProblem({ last_fetched_at: "2026-11-06T23:04:00Z", last_fetch_result: "자동: 1건 새로 수신" }, now)).toBeNull();
  });

  it("수신 실패 기록을 돌려준다", () => {
    expect(fetchProblem({ last_fetched_at: "2026-11-06T23:04:00Z", last_fetch_result: "자동 실패: 원가계산: 오류" }, now)).toBe("자동 실패: 원가계산: 오류");
  });

  it("수신이 오래전이거나 기록이 없으면 알린다", () => {
    expect(fetchProblem({ last_fetched_at: "2026-11-05T22:00:00Z", last_fetch_result: "자동: 0건 새로 수신" }, now)).toContain("수신 기록이 없습니다");
    expect(fetchProblem(null, now)).toContain("수신 기록이 없습니다");
  });
});
