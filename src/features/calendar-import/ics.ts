import ICAL from "ical.js";

/** 외부 캘린더(iCal/ICS)의 일정 하나. 날짜·시간은 한국 시간 기준. */
export type CalendarEvent = {
  uid: string; // 반복 일정은 회차별로 다른 값 (uid#회차시작)
  title: string;
  location: string | null;
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM (종일 일정이면 null)
  end: string | null;
  allDay: boolean;
};

const TZ = "Asia/Seoul";
const pad = (n: number) => String(n).padStart(2, "0");

function seoulParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** ICAL.Time → 한국 시간 날짜/시각. 시간대 정보가 없는(floating) 시각은 한국 시간으로 본다. */
function toSeoul(t: ICAL.Time): { date: string; time: string | null } {
  if (t.isDate) return { date: `${t.year}-${pad(t.month)}-${pad(t.day)}`, time: null };
  const tzid = t.zone?.tzid;
  if (!tzid || tzid === "floating") {
    return { date: `${t.year}-${pad(t.month)}-${pad(t.day)}`, time: `${pad(t.hour)}:${pad(t.minute)}` };
  }
  return seoulParts(t.toJSDate());
}

function toEvent(uid: string, summary: string, location: string | null, start: ICAL.Time, end: ICAL.Time | null): CalendarEvent {
  const s = toSeoul(start);
  const e = end ? toSeoul(end) : null;
  return {
    uid,
    title: summary.trim() || "(제목 없음)",
    location: location?.trim() || null,
    date: s.date,
    start: s.time,
    // 종료가 다른 날이면 종료 시각은 버린다 (강의 일정에는 거의 없음)
    end: s.time && e?.time && e.date === s.date ? e.time : null,
    allDay: start.isDate,
  };
}

/**
 * ICS 텍스트에서 [from, to] (YYYY-MM-DD, 한국 시간) 범위의 일정을 뽑는다.
 * 반복 일정은 회차별로 펼치고, 회차 수정(RECURRENCE-ID)도 반영한다. 취소된 일정은 제외.
 */
export function parseIcs(text: string, from: string, to: string, maxEvents = 1000): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    const tzid = tz.getFirstPropertyValue("tzid");
    if (typeof tzid === "string" && !ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(tz);
  }

  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Component[] = [];
  for (const c of vevents) {
    if (c.hasProperty("recurrence-id")) exceptions.push(c);
    else masters.set(String(c.getFirstPropertyValue("uid") ?? ""), new ICAL.Event(c));
  }
  const orphans: ICAL.Event[] = [];
  for (const c of exceptions) {
    const master = masters.get(String(c.getFirstPropertyValue("uid") ?? ""));
    if (master) master.relateException(c);
    else orphans.push(new ICAL.Event(c));
  }

  const out: CalendarEvent[] = [];
  const inRange = (d: string) => d >= from && d <= to;
  const cancelled = (c: ICAL.Component) => String(c.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

  for (const ev of [...masters.values(), ...orphans]) {
    if (cancelled(ev.component)) continue;
    if (!ev.startDate) continue;

    if (ev.isRecurring()) {
      const it = ev.iterator();
      let next: ICAL.Time | null;
      let guard = 0;
      while ((next = it.next()) && guard++ < 2000) {
        const occ = ev.getOccurrenceDetails(next);
        const ce = toEvent(
          `${ev.uid}#${next.toString()}`,
          occ.item.summary ?? "",
          occ.item.location ?? null,
          occ.startDate,
          occ.endDate,
        );
        if (ce.date > to) break;
        if (inRange(ce.date) && !cancelled(occ.item.component)) out.push(ce);
      }
    } else {
      const uid = ev.recurrenceId ? `${ev.uid}#${ev.recurrenceId.toString()}` : ev.uid;
      const ce = toEvent(uid, ev.summary ?? "", ev.location ?? null, ev.startDate, ev.endDate);
      if (inRange(ce.date)) out.push(ce);
    }
    if (out.length >= maxEvents) break;
  }

  return out.sort((a, b) => (a.date + (a.start ?? "")).localeCompare(b.date + (b.start ?? "")));
}

/** webcal:// → https:// , 그 외 http(s) 만 허용 */
export function normalizeIcsUrl(raw: string): string | null {
  const v = raw.trim().replace(/^webcal:\/\//i, "https://");
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
