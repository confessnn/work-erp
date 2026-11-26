/**
 * 홈 화면 위젯이 읽는 일정 피드.
 *
 * 이 파일의 타입에는 금액 필드가 없다 — 위젯으로 강의료가 새지 않도록 하는 장치
 * (features/share/feed.ts 와 같은 방침). 실제 범위는 DB 함수 get_widget_schedule 이 정한다.
 */

/** DB 함수 get_widget_schedule 한 행 */
export type WidgetRow = {
  kind: "lecture" | "event";
  id: string;
  title: string;
  organization: string | null;
  person: string | null;
  event_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
};

/** 위젯에 보내는 일정 한 건. 글자 수를 줄이려고 키를 짧게 쓴다 (휴대폰이 자주 받으므로) */
export type FeedItem = {
  /** 종류: l = 강의, e = 가족 일정 */
  k: "l" | "e";
  /** 제목 */
  t: string;
  /** 날짜 YYYY-MM-DD */
  d: string;
  /** 시작 HH:MM (종일이면 없음) */
  s?: string;
  /** 끝 HH:MM */
  n?: string;
  /** 누구 (가족 일정만: dad/mom/baby/all) */
  p?: string;
};

export type Feed = {
  /** 피드를 만든 시각 (위젯이 '언제 기준'인지 보여 줄 때 씀) */
  at: string;
  items: FeedItem[];
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : undefined);

/** 제목이 길면 위젯 칸에서 어차피 잘리므로 적당히 끊어 보낸다 */
const TITLE_MAX = 60;

/** DB 행 → 위젯 피드. 금액 칸은 애초에 들어오지 않는다. */
export function buildFeed(rows: WidgetRow[], now: Date): Feed {
  const items: FeedItem[] = rows.map((r) => {
    const item: FeedItem = {
      k: r.kind === "lecture" ? "l" : "e",
      t: (r.title ?? "").slice(0, TITLE_MAX),
      d: r.event_date,
    };
    const s = hhmm(r.start_time);
    if (s) item.s = s;
    const n = hhmm(r.end_time);
    if (n) item.n = n;
    if (r.kind === "event" && r.person) item.p = r.person;
    return item;
  });
  // 날짜 → 종일 먼저 → 시작 시간 → 제목
  items.sort(
    (a, b) => a.d.localeCompare(b.d) || (a.s ?? "").localeCompare(b.s ?? "") || a.t.localeCompare(b.t, "ko"),
  );
  return { at: now.toISOString(), items };
}
