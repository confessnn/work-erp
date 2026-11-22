import { describe, expect, it } from "vitest";
import type { DigestNotice } from "./digest";
import { buildMorning, buildMorningTelegram, nextDay, type AgendaItem } from "./morning";

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
    expect(todayPart).toContain("[가족·임채현]");
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

describe("buildMorningTelegram", () => {
  it("일정과 공고를 텔레그램 서식으로 쓴다", () => {
    const [text, ...rest] = buildMorningTelegram("2026-11-19", [item(), item({ kind: "family", person: "mom", title: "<병원>", place: null })], [notice], []);
    expect(rest).toEqual([]);
    expect(text).toContain("📋 <b>11/19 (목) 오늘 할 일</b>");
    expect(text).toContain("• [강의] <b>09:00~12:00</b> 엑셀 실무 · 청주시청");
    expect(text).toContain("[엄마]");
    expect(text).toContain("&lt;병원&gt;");
    expect(text).toContain('<a href="https://www.g2b.go.kr/x">원가계산 용역</a>');
    expect(text).toContain("<i>요약</i>");
  });

  it("공고가 많아 길어지면 여러 메시지로 나눈다", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...notice, id: String(i), summary: "가".repeat(340) }));
    const chunks = buildMorningTelegram("2026-11-19", [], many, []);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 3800)).toBe(true);
  });

  it("일정도 공고도 없으면 없다고 쓴다", () => {
    const [text] = buildMorningTelegram("2026-11-19", [], [], ["오늘 공고 수신 기록이 없습니다."]);
    expect(text).toContain("⚠️ 오늘 공고 수신 기록이 없습니다.");
    expect(text).toContain("일정 없음");
    expect(text).toContain("새 공고 없음");
  });
});

describe("아침 알림의 할 일", () => {
  const todos = [
    { title: "견적서 <보내기>", due_date: "2026-11-17" },
    { title: "착수계 확인", due_date: "2026-11-19", note: "담당 <손> 팀장\n043-000-0000" },
  ];
  it("텔레그램: 할 일과 밀린 날짜", () => {
    const [text] = buildMorningTelegram("2026-11-19", [], [], [], todos);
    expect(text).toContain("<b>할 일 2개</b>\n☐ 견적서 &lt;보내기&gt; (밀림 · 11/17 (화))\n☐ 착수계 확인\n<i>담당 &lt;손&gt; 팀장\n043-000-0000</i>");
  });
  it("할 일이 없으면 칸을 만들지 않는다", () => {
    expect(buildMorningTelegram("2026-11-19", [], [], [])[0]).not.toContain("할 일 ");
  });
  it("메일 제목과 본문", () => {
    const m = buildMorning("2026-11-19", [], [], [], todos);
    expect(m.subject).toContain("할 일 2개");
    expect(m.html).toContain("☐ 견적서 &lt;보내기&gt;");
    expect(m.html).toContain("담당 &lt;손&gt; 팀장\n043-000-0000</div>");
  });
});

describe("공유받은 할 일", () => {
  it("누가 공유했는지 붙인다 (메일·텔레그램)", () => {
    const todos = [{ title: "기저귀 주문", due_date: "2026-11-22", note: null, who: "아내" }];
    expect(buildMorningTelegram("2026-11-22", [], [], [], todos).join("\n")).toContain("☐ 기저귀 주문 [아내 공유]");
    expect(buildMorning("2026-11-22", [], [], [], todos).html).toContain("[아내 공유]");
  });
  it("아기 할 일은 아기 이름을 붙인다", () => {
    const todos = [{ title: "예방접종 예약", due_date: "2026-11-22", note: null, tag: "임채현" }];
    expect(buildMorningTelegram("2026-11-22", [], [], [], todos).join("\n")).toContain("☐ 예방접종 예약 [임채현]");
  });
});
