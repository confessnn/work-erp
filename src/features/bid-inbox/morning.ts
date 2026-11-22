// 아침 '오늘 할 일' 메일: 오늘·내일 강의와 가족 일정, 새 입찰 공고를 한 통에 담는다.
// 강의료 같은 금액은 넣지 않는다 (메일은 휴대폰 알림 미리보기에도 보이므로).
import { personOf } from "@/features/family/types";
import { escapeTg, packChunks } from "@/features/telegram/api";
import { dateLabel, timeLabel, won } from "@/lib/format";
import { CATEGORY_LABEL } from "./categories";
import { closesLabel, DIGEST_FOOTER, escapeHtml, isWebUrl, needsCheckCount, noticeSectionsHtml, problemsHtml, type DigestMail, type DigestNotice } from "./digest";
import { VERDICT_LABEL } from "./judge";
import type { BidCategory } from "./types";

export type AgendaItem = {
  kind: "lecture" | "family";
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  place: string | null;
  person: string | null;
};

/** 그날까지 안 끝낸 할 일 (cron_morning_todos) */
export type MorningTodo = { title: string; due_date: string; note?: string | null; who?: string | null };

/** 가족이 공유한 할 일이면 누가 공유했는지 */
const whoTag = (t: MorningTodo) => (t.who ? ` [${t.who} 공유]` : "");

const ERP_URL = "https://work-erp-one.vercel.app";

const lateTag = (t: MorningTodo, today: string) => (t.due_date < today ? ` (밀림 · ${dateLabel(t.due_date)})` : "");

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
export function buildMorning(today: string, agenda: AgendaItem[], notices: DigestNotice[], problems: string[], todos: MorningTodo[] = []): DigestMail {
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
    ...(todos.length ? [`할 일 ${todos.length}개`] : []),
    `새 공고 ${notices.length}건`,
    ...(needsCheck ? [`확인 필요 ${needsCheck}건`] : []),
  ].join(" · ");

  const bids = notices.length ? noticeSectionsHtml(notices) + DIGEST_FOOTER : `<p style="color:#666">새 공고 없음</p>`;
  const html = [
    `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">`,
    problemsHtml(problems),
    dayHtml(`오늘 ${dateLabel(today)}`, todays),
    ...(todos.length
      ? [`<h3>할 일 ${todos.length}개</h3><ul style="padding-left:18px">${todos.map((t) => `<li>☐ ${escapeHtml(t.title)}<span style="color:#6b7280">${escapeHtml(whoTag(t))}</span><span style="color:#b45309">${lateTag(t, today)}</span>${t.note ? `<div style="color:#6b7280;font-size:13px;white-space:pre-wrap">${escapeHtml(t.note)}</div>` : ""}</li>`).join("")}</ul>`]
      : []),
    dayHtml(`내일 ${dateLabel(tomorrow)}`, tomorrows),
    `<p><a href="${ERP_URL}/lectures?view=calendar">ERP 달력 열기</a></p>`,
    `<h2 style="font-size:16px;margin-top:20px">새 입찰 공고</h2>`,
    bids,
    `</div>`,
  ].join("");
  return { subject, html };
}

// ---------- 텔레그램 ----------

const tgItem = (a: AgendaItem) => {
  const who = a.kind === "lecture" ? "강의" : personOf(a.person ?? "all").label;
  const place = a.place ? ` · ${escapeTg(a.place)}` : "";
  return `• [${who}] <b>${timeRange(a)}</b> ${escapeTg(a.title)}${place}`;
};

const tgDay = (heading: string, items: AgendaItem[]) =>
  [`<b>${heading}</b>`, ...(items.length ? items.map(tgItem) : ["일정 없음"])].join("\n");

/** 공고 요약은 앞부분만 (자세한 것은 ERP에서) */
const SUMMARY_PREVIEW = 350;

function tgNotice(n: DigestNotice) {
  const title = escapeTg(n.title);
  const link = n.detail_url && isWebUrl(n.detail_url) ? `<a href="${escapeTg(n.detail_url).replace(/"/g, "&quot;")}">${title}</a>` : title;
  const facts = [
    VERDICT_LABEL[n.verdict],
    `마감 ${closesLabel(n.closes_at)}`,
    ...(n.notice_org ? [n.notice_org] : []),
    ...(n.presumed_price !== null ? [`추정가격 ${won(Number(n.presumed_price))}`] : []),
  ];
  const lines = [`• ${link}`, `  ${escapeTg(facts.join(" · "))}`];
  if (n.category === "cost") {
    if (n.summary_error) lines.push(`  ⚠️ 요약 실패: ${escapeTg(n.summary_error)}`);
    else if (!n.summary) lines.push("  요약 대기: 내일 이어서 요약합니다.");
    else {
      const s = n.summary.split(/\n+/).filter((l) => !/^읽(은|지 못한) 문서/.test(l)).join("\n");
      lines.push(`<i>${escapeTg(s.length > SUMMARY_PREVIEW ? `${s.slice(0, SUMMARY_PREVIEW)}…` : s)}</i>`);
    }
  }
  return lines.join("\n");
}

/** 텔레그램 메시지 조각들 (한 조각 4천 자 이하). 일정·공고가 없어도 보낸다 */
export function buildMorningTelegram(today: string, agenda: AgendaItem[], notices: DigestNotice[], problems: string[], todos: MorningTodo[] = []): string[] {
  const tomorrow = nextDay(today);
  const head = [`📋 <b>${dateLabel(today)} 오늘 할 일</b>`, ...problems.map((p) => `⚠️ ${escapeTg(p)}`)].join("\n");
  const blocks = [
    head,
    tgDay("오늘", agenda.filter((a) => a.event_date === today)),
    ...(todos.length ? [[`<b>할 일 ${todos.length}개</b>`, ...todos.map((t) => `☐ ${escapeTg(t.title)}${escapeTg(whoTag(t))}${lateTag(t, today)}${t.note ? `\n<i>${escapeTg(t.note)}</i>` : ""}`)].join("\n")] : []),
    tgDay(`내일 ${dateLabel(tomorrow)}`, agenda.filter((a) => a.event_date === tomorrow)),
  ];
  if (notices.length === 0) blocks.push("<b>새 입찰 공고</b>\n새 공고 없음");
  for (const category of Object.keys(CATEGORY_LABEL) as BidCategory[]) {
    const rows = notices.filter((n) => n.category === category);
    if (!rows.length) continue;
    blocks.push(`<b>새 공고 · ${CATEGORY_LABEL[category]} ${rows.length}건</b>`);
    blocks.push(...rows.map(tgNotice));
  }
  if (notices.length) blocks.push("<i>AI 요약이라 틀릴 수 있어요. 투찰 전에 원문을 확인하세요.</i>");
  return packChunks(blocks);
}

export const MORNING_BUTTONS = [
  { text: "할 일 체크", url: `${ERP_URL}/` },
  { text: "달력 열기", url: `${ERP_URL}/lectures?view=calendar` },
  { text: "공고 수신함", url: `${ERP_URL}/bids` },
];
