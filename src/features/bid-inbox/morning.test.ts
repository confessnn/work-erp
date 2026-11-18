import { describe, expect, it } from "vitest";
import type { DigestNotice } from "./digest";
import { buildMorning, nextDay, type AgendaItem } from "./morning";

const item = (over: Partial<AgendaItem> = {}): AgendaItem => ({
  kind: "lecture",
  event_date: "2026-11-19",
  start_time: "09:00:00",
  end_time: "12:00:00",
  title: "엑셀 실무",
  place: "청주시청",
  person: null,
  ...over,
});

const notice: DigestNotice = {
  id: "a",
  category: "cost",
  title: "원가계산 용역",
  verdict: "possible",
  verdict_reason: null,
  notice_org: "기관",
  presumed_price: 1000,
  closes_at: "2026-11-25T01:00:00Z",
  detail_url: "https://www.g2b.go.kr/x",
  summary: "요약",
  summary_error: null,
};

describe("nextDay", () => {
  it("달과 해가 바뀌어도 다음 날을 구한다", () => {
    expect(nextDay("2026-11-30")).toBe("2026-12-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});

describe("buildMorning", () => {
  it("일정도 공고도 없어도 메일을 만든다", () => {
    const mail = buildMorning("2026-11-19", [], [], []);
    expect(mail.subject).toBe("[오늘 할 일] 11/19 (목) · 강의 없음 · 새 공고 0건");
    expect(mail.html).toContain("일정 없음");
    expect(mail.html).toContain("새 공고 없음");
  });

  it("오늘과 내일 일정을 나눠 쓰고 제목에 오늘 건수를 넣는다", () => {
    const agenda = [
      item(),
      item({ kind: "family", title: "소아과", person: "baby", place: null, start_time: null, end_time: null }),
      item({ event_date: "2026-11-20", title: "한글 기초" }),
    ];
    const mail = buildMorning("2026-11-19", agenda, [notice], []);
    expect(mail.subject).toBe("[오늘 할 일] 11/19 (목) · 강의 1건 · 가족 1건 · 새 공고 1건");
    const [todayPart, tomorrowPart] = mail.html.split("내일 11/20 (금)");
    expect(todayPart).toContain("09:00~12:00</strong> 엑셀 실무 · 청주시청");
    expect(todayPart).toContain("[가족·아기]");
    expect(todayPart).toContain("종일");
    expect(tomorrowPart).toContain("한글 기초");
    expect(mail.html).toContain("원가계산 용역");
  });

  it("일정 제목도 HTML로 해석되지 않게 바꾼다", () => {
    const mail = buildMorning("2026-11-19", [item({ title: "<b>회의</b>" })], [], []);
    expect(mail.html).toContain("&lt;b&gt;회의&lt;/b&gt;");
  });

  it("수신 문제가 있으면 맨 위에 쓰고 제목에 확인 필요를 붙인다", () => {
    const mail = buildMorning("2026-11-19", [], [], ["오늘 공고 수신 기록이 없습니다."]);
    expect(mail.subject).toContain("확인 필요 1건");
    expect(mail.html.indexOf("수신 기록")).toBeLessThan(mail.html.indexOf("오늘 11/19"));
  });
});
