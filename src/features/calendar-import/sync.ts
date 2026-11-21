import { calculateWithholding, grossFrom, hoursBetween, type IncomeType } from "@/features/lectures/tax";
import { feeFields, feeFrom } from "@/features/lectures/fee-memory";
import { occurrenceKey, parseIcsDetailed, type CalendarEvent } from "./ics";

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

/** 중복 비교용 기존 ERP 일정. 시간·강의료 칸은 구글에서 시간이 바뀐 일정을 고칠 때 쓴다 */
export type ExistingLecture = {
  id: string;
  lecture_date: string;
  start_time: string | null;
  title: string;
  external_uid: string | null;
  end_time?: string | null;
  hours?: number | string;
  hourly_rate?: number;
  gross_amount?: number;
  income_type?: IncomeType;
  apply_tax_exemption?: boolean;
};

/** 구글에서 날짜·시간이 바뀐 일정 → ERP 강의에 고칠 값 (없는 칸은 그대로 둔다) */
export type LectureUpdate = {
  id: string;
  external_uid: string;
  lecture_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number;
  hourly_rate?: number;
  gross_amount?: number;
  income_type?: IncomeType;
  apply_tax_exemption?: boolean;
  income_tax?: number;
  local_tax?: number;
  expected_net?: number;
};

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/**
 * 이미 불러온 강의(l)와 구글 일정(e)을 비교해 고칠 값을 돌려준다. 같으면 null.
 * - ID가 옛 형식이면 새 형식으로 바꾼다
 * - 날짜·시간이 바뀌었으면 시간과 강의 시간(hours)을 고치고, 강의료는 시간당이면 다시 계산·고정 금액이면 그대로
 */
export function lectureUpdate(l: ExistingLecture, e: CalendarEvent): LectureUpdate | null {
  const timeChanged =
    l.lecture_date !== e.date || hm(l.start_time) !== e.start || (l.end_time !== undefined && hm(l.end_time) !== e.end);
  if (!timeChanged) return l.external_uid === e.uid ? null : { id: l.id, external_uid: e.uid };

  const hours = hoursBetween(e.start, e.end);
  const fee =
    l.hours !== undefined && l.hourly_rate !== undefined && l.gross_amount !== undefined
      ? feeFrom({
          hours: l.hours,
          hourly_rate: l.hourly_rate,
          gross_amount: l.gross_amount,
          income_type: l.income_type ?? "business",
          apply_tax_exemption: l.apply_tax_exemption ?? true,
        })
      : null;
  return {
    id: l.id,
    external_uid: e.uid,
    lecture_date: e.date,
    start_time: e.start,
    end_time: e.end,
    hours,
    ...(fee ? feeFields(hours, fee) : {}),
  };
}

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
  /** 이미 불러온 강의인데 구글에서 날짜·시간이 바뀜 (또는 ID가 옛 형식) → 고치기 */
  updates: LectureUpdate[];
};

/**
 * 불러올 일정 분류. 일정은 occurrenceKey 로 비교한다 (반복 일정은 날짜까지만 → 시간을 바꿔도 같은 일정).
 * - 이미 불러온 강의: 날짜·시간이 바뀌었으면 고친다
 * - 삭제한 것(known), ERP가 내보낸 것, 키워드 불일치: 건너뛴다
 * - 같은 날짜·시각의 ERP 일정이 있으면 새로 만들지 않고 연결한다
 */
export function planImport(
  events: CalendarEvent[],
  keyword: string | null,
  known: Set<string>,
  existing: ExistingLecture[],
): ImportPlan {
  const pool = [...existing];
  const knownKeys = new Set([...known].map(occurrenceKey));
  const imported = new Map<string, ExistingLecture>();
  for (const l of existing) {
    if (!l.external_uid) continue;
    const k = occurrenceKey(l.external_uid);
    if (!imported.has(k)) imported.set(k, l);
  }
  const plan: ImportPlan = { newEvents: [], links: [], updates: [] };
  for (const e of events) {
    if (isOwnErpEvent(e.uid)) continue;
    const key = occurrenceKey(e.uid);
    const mine = imported.get(key);
    if (mine) {
      imported.delete(key); // 같은 키의 일정이 또 오면 아래 knownKeys 에서 건너뜀
      knownKeys.add(key);
      const u = lectureUpdate(mine, e);
      if (u) plan.updates.push(u);
      continue;
    }
    if (knownKeys.has(key) || !matchesKeyword(e, keyword)) continue;
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
    knownKeys.add(key);
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
  let complete: boolean;
  try {
    ({ events, complete } = parseIcsDetailed(text, today, addDays(today, 365), 5000));
  } catch {
    throw new Error("캘린더 형식을 읽지 못했습니다.");
  }
  const plan = planImport(events, settings.keyword, known, existing.map((l) => ({ ...l })));
  return {
    rows: plan.newEvents.map((e) => eventToRow(e, settings)),
    links: plan.links,
    updates: plan.updates,
    /** 구글에서 지운 강의 판단용. 다 못 읽었으면 null */
    events: complete ? events : null,
  };
}

/** 구글에서 지웠는지 볼 ERP 강의 (DB가 오늘 이후·수령 안 함·서류 제출 없음으로 이미 거른 것) */
export type RemovalCandidate = {
  id: string;
  lecture_date: string;
  external_uid: string | null;
  google_event_id: string | null;
  google_synced_at: string | null;
  updated_at: string;
};

/** 한 번에 이보다 많이, 그리고 후보의 절반 넘게 지워야 하면 캘린더를 잘못 받은 것으로 보고 멈춘다 */
const MAX_SAFE_REMOVALS = 10;
/** ERP가 구글에 올린 지 이 시간이 안 된 일정은 iCal 주소에 아직 안 보일 수 있어 건너뛴다 */
const PUSH_SETTLE_MS = 24 * 60 * 60 * 1000;

/**
 * 구글 캘린더에서 지운 일정 → 지울 ERP 강의 id.
 * events: 사용자의 모든 캘린더에서 [from, to] 범위로 받은 일정 (하나라도 못 받았으면 부르지 않는다)
 * - 구글에서 불러온 강의: 같은 일정(occurrenceKey)이 없으면 지움
 * - ERP가 구글에 올린 강의: ERP 전용 캘린더도 받아왔고(erpCalendarCovered), 올린 뒤 ERP에서 안 고쳤고,
 *   올린 지 하루가 지났는데 구글에 없으면 지움
 */
export function planRemovals(
  events: CalendarEvent[],
  lectures: RemovalCandidate[],
  opts: { from: string; to: string; erpCalendarCovered: boolean; now: number },
): { ids: string[]; blocked?: string } {
  if (events.length === 0) return { ids: [], blocked: "캘린더에 일정이 하나도 없어 지우기를 건너뜀" };
  const keys = new Set(events.map((e) => occurrenceKey(e.uid)));
  const erpIds = new Set(events.filter((e) => isOwnErpEvent(e.uid)).map((e) => e.uid.split("@")[0]));

  const inRange = lectures.filter((l) => l.lecture_date >= opts.from && l.lecture_date <= opts.to);
  const ids = inRange
    .filter((l) => {
      if (l.external_uid) return !keys.has(occurrenceKey(l.external_uid));
      if (!l.google_event_id || !opts.erpCalendarCovered || !l.google_synced_at) return false;
      const synced = Date.parse(l.google_synced_at);
      if (Date.parse(l.updated_at) > synced || opts.now - synced < PUSH_SETTLE_MS) return false;
      return !erpIds.has(l.google_event_id);
    })
    .map((l) => l.id);

  if (ids.length > MAX_SAFE_REMOVALS && ids.length * 2 > inRange.length) {
    return { ids: [], blocked: `구글에서 없어진 강의가 ${ids.length}건이나 돼서 지우지 않음 (캘린더 주소 확인 필요)` };
  }
  return { ids };
}

/** 캘린더 주소가 ERP 전용 구글 캘린더의 것인지 (구글 iCal 주소에는 캘린더 ID가 들어 있다) */
export function isErpCalendarUrl(icsUrl: string, erpCalendarId: string | null) {
  if (!erpCalendarId) return false;
  try {
    return decodeURIComponent(icsUrl).includes(erpCalendarId);
  } catch {
    return icsUrl.includes(erpCalendarId);
  }
}

export type RemovalContext = {
  sources: { id: string; ics_url: string }[];
  erp_calendar_id: string | null;
  lectures: RemovalCandidate[];
};

/**
 * 사용자의 모든 캘린더를 확인해 구글에서 지운 강의 id 를 고른다.
 * already: 이번에 이미 받아온 캘린더의 일정 (다시 받지 않음). 하나라도 못 받으면 아무것도 지우지 않는다.
 */
export async function collectRemovals(
  ctx: RemovalContext,
  already: Map<string, CalendarEvent[] | null>,
  today: string,
  now = Date.now(),
): Promise<{ ids: string[]; blocked?: string }> {
  if (ctx.lectures.length === 0 || ctx.sources.length === 0) return { ids: [] };
  const from = today;
  const to = addDays(today, 365);
  const all: CalendarEvent[] = [];
  for (const s of ctx.sources) {
    let evs = already.get(s.id);
    if (evs === undefined) {
      try {
        const r = parseIcsDetailed(await downloadIcs(s.ics_url), from, to, 5000);
        evs = r.complete ? r.events : null;
      } catch {
        return { ids: [], blocked: "받아오지 못한 캘린더가 있어 지우기를 건너뜀" };
      }
    }
    if (!evs) return { ids: [], blocked: "캘린더 일정을 다 읽지 못해 지우기를 건너뜀" };
    all.push(...evs);
  }
  const erpCalendarCovered = ctx.sources.some((s) => isErpCalendarUrl(s.ics_url, ctx.erp_calendar_id));
  return planRemovals(all, ctx.lectures, { from, to, erpCalendarCovered, now });
}
