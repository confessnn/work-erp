import { PERSONS, type Person } from "./types";

export type EventInput = {
  person: Person;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

/** 가족 일정 입력값 검사. 종일 일정이면 시간을 비운다. */
export function parseEventInput(get: (k: string) => unknown): { ok: true; value: EventInput } | { ok: false; error: string } {
  const s = (k: string) => {
    const v = get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const person = s("person") as Person;
  if (!PERSONS.some((p) => p.v === person)) return { ok: false, error: "누구의 일정인지 골라 주세요." };
  const title = s("title");
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };
  if (title.length > 200) return { ok: false, error: "제목은 200자까지 쓸 수 있어요." };
  const date = s("event_date");
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return { ok: false, error: "날짜를 확인해 주세요." };

  const allDay = get("all_day") === "on";
  let start = allDay ? "" : s("start_time");
  let end = allDay ? "" : s("end_time");
  if (start && !TIME.test(start)) return { ok: false, error: "시작 시간을 확인해 주세요." };
  if (end && !TIME.test(end)) return { ok: false, error: "끝 시간을 확인해 주세요." };
  if (!start) end = "";
  if (start && end && end.slice(0, 5) <= start.slice(0, 5)) return { ok: false, error: "끝 시간은 시작 시간보다 늦어야 해요." };
  start = start.slice(0, 5);
  end = end.slice(0, 5);

  const memo = s("memo");
  if (memo.length > 2000) return { ok: false, error: "메모는 2000자까지 쓸 수 있어요." };

  return {
    ok: true,
    value: { person, title, event_date: date, start_time: start || null, end_time: end || null, memo: memo || null },
  };
}

/** 한 달 조회 범위 [start, next) */
export function monthRange(year: number, month: number) {
  const mm = (m: number) => String(m).padStart(2, "0");
  return {
    start: `${year}-${mm(month)}-01`,
    next: month === 12 ? `${year + 1}-01-01` : `${year}-${mm(month + 1)}-01`,
  };
}

/** 로그인 후 돌아갈 주소. 초대 수락 화면만 허용 (다른 사이트로 보내는 것 방지) */
export function safeNext(v: unknown): string | null {
  // 가족 초대(/join/<토큰>)와 공고 공유 초대(/join/bids/<토큰>)만 허용
  return typeof v === "string" && /^\/join\/(bids\/)?[0-9a-f]{48}$/.test(v) ? v : null;
}
