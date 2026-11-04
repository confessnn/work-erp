/**
 * 가족 공유용 데이터와 iCal 구독 피드.
 * 이 파일의 타입에는 금액 필드가 없다 — 공유 화면/피드에 강의료가 새지 않도록 하는 장치.
 */

export type SharedEvent = {
  id: string;
  title: string;
  organization: string | null;
  lecture_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  updated_at: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** iCal 텍스트 값 이스케이프 (RFC 5545) */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** 75바이트 근처에서 줄 접기 (RFC 5545 3.1). 한글이 끊기지 않게 글자 단위로 자른다. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const compactDate = (d: string) => d.replaceAll("-", "");
const compactTime = (t: string) => t.slice(0, 5).replace(":", "") + "00";

function nextDay(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + 1));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

function stamp(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function buildIcsFeed(events: SharedEvent[], calendarName = "강의 일정"): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//work-erp//share//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Seoul",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Seoul",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const e of events) {
    const d = compactDate(e.lecture_date);
    lines.push("BEGIN:VEVENT", `UID:${e.id}@work-erp`, `DTSTAMP:${stamp(e.updated_at)}`);
    if (e.start_time) {
      lines.push(`DTSTART;TZID=Asia/Seoul:${d}T${compactTime(e.start_time)}`);
      const end = e.end_time && e.end_time > e.start_time ? e.end_time : null;
      if (end) lines.push(`DTEND;TZID=Asia/Seoul:${d}T${compactTime(end)}`);
      else lines.push("DURATION:PT1H");
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nextDay(e.lecture_date)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.organization) lines.push(`LOCATION:${esc(e.organization)}`);
    lines.push("TRANSP:OPAQUE", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
