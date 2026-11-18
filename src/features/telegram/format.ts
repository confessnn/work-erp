// 텔레그램 메시지 만들기 (parse_mode=HTML: b, i, a 정도만 쓰고 나머지 글자는 이스케이프)
// 금액(강의료)은 넣지 않는다. 휴대폰 잠금화면 미리보기에도 보이기 때문.
import { personOf } from "@/features/family/types";
import { dateLabel, timeLabel } from "@/lib/format";
import { CATEGORY_LABEL } from "@/features/bid-inbox/categories";
import { VERDICT_LABEL } from "@/features/bid-inbox/judge";
import type { DigestNotice } from "@/features/bid-inbox/digest";
import type { AgendaItem } from "@/features/bid-inbox/morning";
import type { BidCategory } from "@/features/bid-inbox/types";
import { won } from "@/lib/format";

export const ERP_URL = "https://work-erp-one.vercel.app";
/** 텔레그램 한 메시지 최대 4096자. 여유를 둔다 */
const LIMIT = 3900;

export const tgEscape = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
const attr = (s: string) => tgEscape(s).replace(/"/g, "&quot;");

const isWebUrl = (url: string) => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

function timeRange(a: AgendaItem) {
  if (!a.start_time) return "종일";
  return a.end_time ? `${timeLabel(a.start_time)}~${timeLabel(a.end_time)}` : timeLabel(a.start_time);
}

function agendaLine(a: AgendaItem) {
  const tag = a.kind === "lecture" ? "강의" : personOf(a.person ?? "all").label;
  return `• <b>${timeRange(a)}</b> ${tgEscape(a.title)}${a.place ? ` · ${tgEscape(a.place)}` : ""} <i>(${tag})</i>`;
}

const closes = (at: string | null) =>
  at
    ? new Date(at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    : "마감일 미상";

function noticeLine(n: DigestNotice) {
  const title = n.detail_url && isWebUrl(n.detail_url) ? `<a href="${attr(n.detail_url)}">${tgEscape(n.title)}</a>` : tgEscape(n.title);
  const facts = [VERDICT_LABEL[n.verdict], `마감 ${closes(n.closes_at)}`, ...(n.presumed_price !== null ? [`추정 ${won(Number(n.presumed_price))}`] : [])];
  const summary = n.category === "cost" ? (n.summary_error ? " · 요약 실패" : n.summary ? " · 요약 있음" : " · 요약 대기") : "";
  return `• ${title}\n   ${tgEscape(facts.join(" · "))}${summary}`;
}

/** 긴 글은 줄 단위로 나눠 여러 메시지로 */
export function splitMessage(lines: string[], limit = LIMIT): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of lines) {
    const piece = line.length > limit ? line.slice(0, limit - 1) + "…" : line;
    if (cur && cur.length + 1 + piece.length > limit) {
      out.push(cur);
      cur = piece;
    } else cur = cur ? `${cur}\n${piece}` : piece;
  }
  if (cur) out.push(cur);
  return out;
}

/** 매일 아침 '오늘 할 일': 오늘·내일 일정 + 새 공고 + 수신 문제. 메일과 같은 내용을 짧게 */
export function buildMorningTelegram(today: string, tomorrow: string, agenda: AgendaItem[], notices: DigestNotice[], problems: string[]): string[] {
  const todays = agenda.filter((a) => a.event_date === today);
  const tomorrows = agenda.filter((a) => a.event_date === tomorrow);
  const lines: string[] = [`☀️ <b>오늘 할 일 · ${dateLabel(today)}</b>`];
  for (const p of problems) lines.push(`⚠️ ${tgEscape(p)}`);

  lines.push("", `<b>오늘</b>`, ...(todays.length ? todays.map(agendaLine) : ["일정 없음"]));
  lines.push("", `<b>내일 ${dateLabel(tomorrow)}</b>`, ...(tomorrows.length ? tomorrows.map(agendaLine) : ["일정 없음"]));

  lines.push("", `📋 <b>새 입찰 공고 ${notices.length}건</b>`);
  if (!notices.length) lines.push("새 공고 없음");
  for (const category of Object.keys(CATEGORY_LABEL) as BidCategory[]) {
    const rows = notices.filter((n) => n.category === category);
    if (rows.length) lines.push(`<i>${tgEscape(CATEGORY_LABEL[category])} ${rows.length}건</i>`, ...rows.map(noticeLine));
  }
  lines.push("", `<a href="${ERP_URL}/bids">공고 수신함</a> · <a href="${ERP_URL}/lectures?view=calendar">달력</a>`);
  return splitMessage(lines);
}

/** 일정 알림 한 건 */
export function reminderMessage(title: string, body: string, url: string) {
  const link = url.startsWith("/") ? `${ERP_URL}${url}` : ERP_URL;
  return `⏰ <b>${tgEscape(title)}</b>\n${tgEscape(body)}\n<a href="${attr(link)}">ERP에서 보기</a>`;
}
