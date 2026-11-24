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

/** 시작 + 1시간. 자정을 넘으면 다음 날로 (23:30 시작 → 다음 날 00:30) */
function plusHour(date: string, t: string) {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + 60;
  const day = total >= 24 * 60 ? nextDay(date) : date;
  const mins = total % (24 * 60);
  return `${day}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00`;
}

const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t.slice(0, 8));

/** 강의 날짜·시간 → 구글 일정 시작/끝 (끝 시간이 없으면 1시간, 시간이 없으면 종일) */
export function lectureTimes(l: Pick<Lecture, "lecture_date" | "start_time" | "end_time">): Pick<GoogleEvent, "start" | "end"> {
  if (!l.start_time) return { start: { date: l.lecture_date }, end: { date: nextDay(l.lecture_date) } };
  const s = hhmmss(l.start_time);
  const e = l.end_time && l.end_time > l.start_time ? `${l.lecture_date}T${hhmmss(l.end_time)}` : plusHour(l.lecture_date, l.start_time);
  return { start: { dateTime: `${l.lecture_date}T${s}`, timeZone: TZ }, end: { dateTime: e, timeZone: TZ } };
}

/**
 * 구글에서 불러온 강의를 ERP에서 고쳤을 때 구글 원본에 보낼 내용 (제목·날짜·시간·장소만).
 * 설명(메모)은 사용자가 구글에 쓴 내용일 수 있어 건드리지 않는다.
 */
export function importedEventPatch(l: Pick<Lecture, "title" | "organization" | "lecture_date" | "start_time" | "end_time">) {
  return { summary: l.title, ...(l.organization ? { location: l.organization } : {}), ...lectureTimes(l) };
}

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
  const { start, end } = lectureTimes(l);

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

/**
 * 구글에서 불러온 강의의 ID(external_uid) → 구글 일정 ID와 (반복 일정이면) 회차 날짜.
 * - 구글 iCal 의 UID 는 "<일정ID>@google.com". 반복 회차는 뒤에 "#YYYY-MM-DD" (옛 형식 "#YYYY-MM-DDTHH:MM:SS")
 * - 구글에서 만든 일정이 아니면(다른 앱에서 가져온 UID 등) null → 구글에서 지울 수 없음
 */
export function googleTargetFromUid(uid: string): { eventId: string; date: string | null } | null {
  const i = uid.indexOf("#");
  const base = i < 0 ? uid : uid.slice(0, i);
  const m = /^([a-z0-9_]+)@google\.com$/.exec(base);
  if (!m) return null;
  if (i < 0) return { eventId: m[1], date: null };
  const d = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(uid.slice(i + 1));
  return d ? { eventId: m[1], date: `${d[1]}-${d[2]}-${d[3]}` } : null;
}

/** 구글 API 일정의 시작 (시간 있는 일정 / 종일 일정) */
export type GoogleStart = { dateTime?: string; date?: string; timeZone?: string };

/** "2026-12-01T18:00:00+09:00" 같은 시각의 한국 시간 HH:MM:SS */
function seoulClock(dateTime: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(dateTime));
}

/**
 * 반복 일정의 한 회차 ID (구글 규칙: "<일정ID>_<원래 시작 UTC YYYYMMDDTHHMMSSZ>", 종일이면 "<일정ID>_<YYYYMMDD>").
 * 회차의 원래 시작 시각 = 반복 일정(master)의 시작 시각(한국 시간) + 회차 날짜.
 */
export function instanceIdFor(eventId: string, masterStart: GoogleStart, date: string): string | null {
  if (masterStart.date) return `${eventId}_${date.replaceAll("-", "")}`;
  if (!masterStart.dateTime) return null;
  const utc = new Date(`${date}T${seoulClock(masterStart.dateTime)}+09:00`);
  if (Number.isNaN(utc.getTime())) return null;
  return `${eventId}_${utc.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

/** 구글 일정 시작의 한국 날짜 (회차 찾기용) */
export function seoulDateOf(start: GoogleStart): string | null {
  if (start.date) return start.date;
  if (!start.dateTime) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(start.dateTime),
  );
}
