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

/** 중복 비교용 기존 ERP 일정 */
export type ExistingLecture = {
  id: string;
  lecture_date: string;
  start_time: string | null;
  title: string;
  external_uid: string | null;
};

/** ERP가 직접 내보낸 일정(구글 ERP 캘린더 / 가족 공유 피드)이면 true → 다시 불러오지 않는다 */
export function isOwnErpEvent(uid: string) {
  return /^erp[0-9a-f]{32}(@|$)/.test(uid) || uid.endsWith("@work-erp");
}

const norm = (t: string) => t.replace(/\s+/g, "").toLowerCase();

/**
 * 같은 강의로 볼 기존 일정 찾기.
 * - 시간 있는 일정: 같은 날짜 + 같은 시작 시각 (한 사람이 같은 시각에 강의 두 개를 할 수 없으므로)
 * - 종일 일정: 같은 날짜 + 같은 제목(공백·대소문자 무시)
 */
export function findDuplicate(e: CalendarEvent, existing: ExistingLecture[]): ExistingLecture | null {
  return (
    existing.find((l) => {
      if (l.lecture_date !== e.date) return false;
      const ls = l.start_time ? l.start_time.slice(0, 5) : null;
      if (e.start) return ls === e.start;
      return ls === null && norm(l.title) === norm(e.title);
    }) ?? null
  );
}

export type ImportPlan = {
  /** 새로 만들 강의 */
  newEvents: CalendarEvent[];
  /** ERP에 이미 있는 강의 → 구글 원본과 연결만 */
  links: { lecture_id: string; external_uid: string }[];
};

/**
 * 불러올 일정 분류. 이미 불러왔거나 삭제한 것(known), ERP가 내보낸 것, 키워드 불일치는 건너뛴다.
 * 같은 날짜·시각의 ERP 일정이 있으면 새로 만들지 않고 연결한다.
 */
export function planImport(
  events: CalendarEvent[],
  keyword: string | null,
  known: Set<string>,
  existing: ExistingLecture[],
): ImportPlan {
  const pool = [...existing];
  const plan: ImportPlan = { newEvents: [], links: [] };
  for (const e of events) {
    if (known.has(e.uid) || isOwnErpEvent(e.uid) || !matchesKeyword(e, keyword)) continue;
    const dup = findDuplicate(e, pool);
    if (dup) {
      if (!dup.external_uid) {
        plan.links.push({ lecture_id: dup.id, external_uid: e.uid });
        dup.external_uid = e.uid; // 같은 ERP 일정에 두 번 연결하지 않도록
      }
      continue;
    }
    plan.newEvents.push(e);
    // 같은 캘린더 안의 똑같은 일정 두 개도 하나만 만들도록
    pool.push({ id: `new:${e.uid}`, lecture_date: e.date, start_time: e.start, title: e.title, external_uid: e.uid });
  }
  return plan;
}

/** 자동 불러오기 범위: 오늘 ~ 1년 뒤 (지난 일정은 자동으로 가져오지 않음) */
export async function collectAutoImport(
  icsUrl: string,
  settings: ImportSettings,
  known: Set<string>,
  existing: ExistingLecture[],
  today: string,
) {
  const text = await downloadIcs(icsUrl);
  let events: CalendarEvent[];
  try {
    events = parseIcs(text, today, addDays(today, 365));
  } catch {
    throw new Error("캘린더 형식을 읽지 못했습니다.");
  }
  const plan = planImport(events, settings.keyword, known, existing.map((l) => ({ ...l })));
  return { rows: plan.newEvents.map((e) => eventToRow(e, settings)), links: plan.links };
}
