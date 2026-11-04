import type { Lecture } from "@/features/lectures/types";
import { won } from "@/lib/format";

/** 구글 캘린더 API Event 리소스 중 우리가 쓰는 부분 */
export type GoogleEvent = {
  status: "confirmed";
  summary: string;
  location?: string;
  description?: string;
  start: { dateTime: string; timeZone: string } | { date: string };
  end: { dateTime: string; timeZone: string } | { date: string };
  extendedProperties: { private: { erpLectureId: string } };
};

const TZ = "Asia/Seoul";

/**
 * 강의 ID로 정해지는 구글 일정 ID (영문 소문자 a-v + 숫자만 허용 → uuid 의 16진수는 그대로 사용 가능).
 * 같은 강의를 두 번 만들려 하면 구글이 409로 거절하므로 중복 일정이 생기지 않는다.
 */
export const googleEventIdFor = (lectureId: string) => `erp${lectureId.replaceAll("-", "").toLowerCase()}`;

function nextDay(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
}

function plusHour(t: string) {
  const [h, m] = t.split(":").map(Number);
  const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t.slice(0, 8));

/**
 * 강의 → 구글 일정.
 * showAmounts=false 이면 금액 정보를 일정에 전혀 넣지 않는다 (기본값).
 */
export function lectureToGoogleEvent(
  l: Pick<
    Lecture,
    "id" | "title" | "organization" | "lecture_date" | "start_time" | "end_time" | "memo" | "gross_amount" | "expected_net" | "income_type" | "is_paid"
  >,
  showAmounts: boolean,
): GoogleEvent {
  let start: GoogleEvent["start"];
  let end: GoogleEvent["end"];
  if (l.start_time) {
    const s = hhmmss(l.start_time);
    const e = l.end_time && l.end_time > l.start_time ? hhmmss(l.end_time) : `${plusHour(l.start_time)}:00`;
    start = { dateTime: `${l.lecture_date}T${s}`, timeZone: TZ };
    end = { dateTime: `${l.lecture_date}T${e}`, timeZone: TZ };
  } else {
    start = { date: l.lecture_date };
    end = { date: nextDay(l.lecture_date) };
  }

  const lines: string[] = [];
  if (showAmounts) {
    lines.push(
      `강의료(세전) ${won(l.gross_amount)}`,
      `예상 수령액 ${won(l.expected_net)} (${l.income_type === "business" ? "사업소득 3.3%" : "기타소득 8.8%"})`,
      l.is_paid ? "수령 완료" : "미수령",
    );
  }
  if (l.memo) lines.push(l.memo);
  lines.push("— work-erp에서 관리하는 일정입니다. 수정은 work-erp에서 해주세요.");

  return {
    status: "confirmed", // 구글에서 지워진 일정을 수정하면 되살아나도록
    summary: l.title,
    ...(l.organization ? { location: l.organization } : {}),
    description: lines.join("\n"),
    start,
    end,
    extendedProperties: { private: { erpLectureId: l.id } },
  };
}
