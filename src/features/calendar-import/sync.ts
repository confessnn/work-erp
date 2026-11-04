import { calculateWithholding, grossFrom, hoursBetween, type IncomeType } from "@/features/lectures/tax";
import { parseIcs, type CalendarEvent } from "./ics";

/** 캘린더별 불러오기 설정 (calendar_sources 의 자동 불러오기 컬럼) */
export type ImportSettings = {
  keyword: string | null;
  hourly_rate: number;
  income_type: IncomeType;
  apply_tax_exemption: boolean;
  org_from_location: boolean;
};

/** 캘린더 일정 1개 → lectures 행 (user_id 제외) */
export function eventToRow(e: CalendarEvent, s: Omit<ImportSettings, "keyword">) {
  const hours = hoursBetween(e.start, e.end);
  const gross = grossFrom(hours, s.hourly_rate);
  const tax = calculateWithholding(gross, s.income_type, s.apply_tax_exemption);
  return {
    external_uid: e.uid,
    title: e.title.slice(0, 200),
    organization: s.org_from_location && e.location ? e.location.slice(0, 200) : null,
    lecture_date: e.date,
    start_time: e.start,
    end_time: e.end,
    hours,
    hourly_rate: s.hourly_rate,
    gross_amount: gross,
    income_type: s.income_type,
    apply_tax_exemption: s.apply_tax_exemption,
    income_tax: tax.incomeTax,
    local_tax: tax.localTax,
    expected_net: tax.net,
  };
}

/** 키워드는 쉼표로 여러 개 가능 ("강의, 특강"). 하나라도 제목·장소에 있으면 통과. 비우면 전부 통과. */
export function matchesKeyword(e: CalendarEvent, keyword: string | null): boolean {
  const words = (keyword ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${e.title} ${e.location ?? ""}`.toLowerCase();
  return words.some((w) => hay.includes(w.toLowerCase()));
}

/** 자동 불러오기 대상: 범위 안 + 키워드 일치 + 아직 없음(삭제했던 일정 포함) */
export function selectNewEvents(events: CalendarEvent[], keyword: string | null, known: Set<string>) {
  return events.filter((e) => !known.has(e.uid) && matchesKeyword(e, keyword));
}

/** ICS 주소에서 받아오기. 실패하면 사용자에게 보여줄 한국어 메시지를 던진다. */
export async function downloadIcs(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "text/calendar, */*" },
      cache: "no-store",
    });
  } catch {
    throw new Error("캘린더 주소에 연결하지 못했습니다. 주소를 확인하세요.");
  }
  if (!res.ok) throw new Error(`캘린더를 받아오지 못했습니다 (HTTP ${res.status}). 주소를 확인하세요.`);
  const text = await res.text();
  if (text.length > 10_000_000) throw new Error("캘린더 파일이 너무 큽니다.");
  return text;
}

export function addDays(d: string, n: number) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
}

/** 자동 불러오기 범위: 오늘 ~ 1년 뒤 (지난 일정은 자동으로 가져오지 않음) */
export async function collectAutoImportRows(
  icsUrl: string,
  settings: ImportSettings,
  known: Set<string>,
  today: string,
) {
  const text = await downloadIcs(icsUrl);
  let events: CalendarEvent[];
  try {
    events = parseIcs(text, today, addDays(today, 365));
  } catch {
    throw new Error("캘린더 형식을 읽지 못했습니다.");
  }
  return selectNewEvents(events, settings.keyword, known).map((e) => eventToRow(e, settings));
}
