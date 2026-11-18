// 아침 '오늘 할 일' 메일: 오늘·내일 강의와 가족 일정, 새 입찰 공고를 한 통에 담는다.
// 강의료 같은 금액은 넣지 않는다 (메일은 휴대폰 알림 미리보기에도 보이므로).
import { personOf } from "@/features/family/types";
import { dateLabel, timeLabel } from "@/lib/format";
import { DIGEST_FOOTER, escapeHtml, needsCheckCount, noticeSectionsHtml, problemsHtml, type DigestMail, type DigestNotice } from "./digest";

export type AgendaItem = {
  kind: "lecture" | "family";
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  place: string | null;
  person: string | null;
};

const ERP_URL = "https://work-erp-one.vercel.app";

/** "2026-11-18" 다음 날 */
export function nextDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function timeRange(a: AgendaItem) {
  if (!a.start_time) return "종일";
  return a.end_time ? `${timeLabel(a.start_time)}~${timeLabel(a.end_time)}` : timeLabel(a.start_time);
}

function itemHtml(a: AgendaItem) {
  const tag = a.kind === "lecture" ? "강의" : `가족·${personOf(a.person ?? "all").label}`;
  const place = a.place ? ` · ${escapeHtml(a.place)}` : "";
  return `<li style="margin-bottom:6px"><span style="color:#666">[${tag}]</span> <strong>${timeRange(a)}</strong> ${escapeHtml(a.title)}${place}</li>`;
}

function dayHtml(heading: string, items: AgendaItem[]) {
  const body = items.length ? `<ul style="padding-left:18px">${items.map(itemHtml).join("")}</ul>` : `<p style="color:#666">일정 없음</p>`;
  return `<h3>${heading}</h3>${body}`;
}

/** 매일 보낸다. 일정도 새 공고도 없으면 '없음'이라고 쓴다 */
export function buildMorning(today: string, agenda: AgendaItem[], notices: DigestNotice[], problems: string[]): DigestMail {
  const tomorrow = nextDay(today);
  const todays = agenda.filter((a) => a.event_date === today);
  const tomorrows = agenda.filter((a) => a.event_date === tomorrow);
  const lectures = todays.filter((a) => a.kind === "lecture").length;
  const family = todays.length - lectures;
  const needsCheck = needsCheckCount(notices, problems);

  const subject = [
    `[오늘 할 일] ${dateLabel(today)}`,
    lectures ? `강의 ${lectures}건` : "강의 없음",
    ...(family ? [`가족 ${family}건`] : []),
    `새 공고 ${notices.length}건`,
    ...(needsCheck ? [`확인 필요 ${needsCheck}건`] : []),
  ].join(" · ");

  const bids = notices.length ? noticeSectionsHtml(notices) + DIGEST_FOOTER : `<p style="color:#666">새 공고 없음</p>`;
  const html = [
    `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">`,
    problemsHtml(problems),
    dayHtml(`오늘 ${dateLabel(today)}`, todays),
    dayHtml(`내일 ${dateLabel(tomorrow)}`, tomorrows),
    `<p><a href="${ERP_URL}/lectures?view=calendar">ERP 달력 열기</a></p>`,
    `<h2 style="font-size:16px;margin-top:20px">새 입찰 공고</h2>`,
    bids,
    `</div>`,
  ].join("");
  return { subject, html };
}
