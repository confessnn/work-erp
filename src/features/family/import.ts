import { parseIcs, type CalendarEvent } from "@/features/calendar-import/ics";
import { addDays, downloadIcs, isOwnErpEvent } from "@/features/calendar-import/sync";

/** 가져오는 기간: 30일 전 ~ 1년 뒤. 그보다 오래된 가져온 일정은 그대로 둔다. */
export function importWindow(today: string) {
  return { from: addDays(today, -30), to: addDays(today, 365) };
}

export type ImportRow = {
  external_uid: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
};

/** 구글 캘린더 일정 → 가족 일정 행. ERP가 구글로 내보낸 강의 사본은 뺀다(강의는 이미 가족 달력에 보임). */
export function toImportRows(events: CalendarEvent[]): ImportRow[] {
  return events
    .filter((e) => !isOwnErpEvent(e.uid))
    .map((e) => ({
      external_uid: e.uid,
      title: (e.title || "(제목 없음)").slice(0, 200),
      event_date: e.date,
      start_time: e.allDay ? null : e.start,
      end_time: e.allDay || !e.start ? null : e.end && e.end > e.start ? e.end : null,
    }));
}

/** iCal 주소에서 가져올 행을 만든다. 실패하면 사람이 읽을 수 있는 이유로 throw. */
export async function fetchImportRows(icsUrl: string, today: string): Promise<{ from: string; rows: ImportRow[] }> {
  const { from, to } = importWindow(today);
  const text = await downloadIcs(icsUrl);
  let events: CalendarEvent[];
  try {
    events = parseIcs(text, from, to, 2000);
  } catch {
    throw new Error("캘린더 형식을 읽지 못했어요.");
  }
  return { from, rows: toImportRows(events) };
}

/** 이 시간보다 오래 안 가져온 캘린더는 가족 달력을 열 때 다시 가져온다 */
export const STALE_MINUTES = 30;
