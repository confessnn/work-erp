import ICAL from "ical.js";

/** 외부 캘린더(iCal/ICS)의 일정 하나. 날짜·시간은 한국 시간 기준. */
export type CalendarEvent = {
  uid: string; // 반복 일정은 회차별로 다른 값 (uid#회차 원래 날짜 YYYY-MM-DD). 비교는 occurrenceKey()로
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

/** 반복 일정 회차 ID: 원래 회차 날짜(한국 시간)만 쓴다. 시간을 바꿔도 같은 회차로 남도록 */
const occurrenceUid = (uid: string, recurrenceId: ICAL.Time) => `${uid}#${toSeoul(recurrenceId).date}`;

/**
 * 같은 일정인지 비교할 때 쓰는 키.
 * - 옛 형식 "uid#2026-12-01T17:30:00" (회차 시각 포함)도 "uid#2026-12-01" 로 맞춘다.
 *   UTC 형식("...T083000Z")은 한국 날짜로 바꾼다.
 * - 구글에서 "이 일정 및 향후 일정"을 바꾸면 반복 일정이 "uid_R20261201T083000" 으로 나뉘는데, 같은 반복으로 본다.
 */
export function occurrenceKey(uid: string): string {
  const i = uid.indexOf("#");
  const base = (i < 0 ? uid : uid.slice(0, i)).replace(/_R\d{8}(T\d{6}Z?)?(?=@|$)/, "");
  if (i < 0) return base;
  const rest = uid.slice(i + 1);
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2})(Z)?)?$/.exec(rest);
  if (!m) return `${base}#${rest}`;
  const [, y, mo, d, h, mi, sec, z] = m;
  if (z && h) return `${base}#${seoulParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec))).date}`;
  return `${base}#${y}-${mo}-${d}`;
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
  return parseIcsDetailed(text, from, to, maxEvents).events;
}

/**
 * parseIcs 와 같고, 범위 안 일정을 전부 읽었는지(complete)도 알려준다.
 * 일정 수 한도(maxEvents)나 반복 회차 한도에 걸리면 complete=false → '구글에서 지워짐' 판단에 쓰면 안 된다.
 */
export function parseIcsDetailed(
  text: string,
  from: string,
  to: string,
  maxEvents = 1000,
): { events: CalendarEvent[]; complete: boolean } {
  let complete = true;
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
      while ((next = it.next())) {
        if (guard++ >= 2000) {
          complete = false;
          break;
        }
        const occ = ev.getOccurrenceDetails(next);
        const ce = toEvent(
          occurrenceUid(ev.uid, next),
          occ.item.summary ?? "",
          occ.item.location ?? null,
          occ.startDate,
          occ.endDate,
        );
        if (ce.date > to) break;
        if (inRange(ce.date) && !cancelled(occ.item.component)) out.push(ce);
      }
    } else {
      const uid = ev.recurrenceId ? occurrenceUid(ev.uid, ev.recurrenceId) : ev.uid;
      const ce = toEvent(uid, ev.summary ?? "", ev.location ?? null, ev.startDate, ev.endDate);
      if (inRange(ce.date)) out.push(ce);
    }
    if (out.length >= maxEvents) {
      complete = false;
      break;
    }
  }

  // 하루에 같은 반복 일정 회차가 둘 이상이면(시간 단위 반복 등) 두 번째부터 시각을 붙여 ID가 겹치지 않게 한다
  const seen = new Set<string>();
  for (const e of out) {
    if (seen.has(e.uid)) e.uid = `${e.uid}T${(e.start ?? "").replace(":", "")}`;
    seen.add(e.uid);
  }

  out.sort((a, b) => (a.date + (a.start ?? "")).localeCompare(b.date + (b.start ?? "")));
  return { events: out, complete };
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
