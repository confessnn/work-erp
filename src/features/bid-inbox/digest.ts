import { won } from "@/lib/format";
import { CATEGORY_LABEL } from "./categories";
import { VERDICT_LABEL } from "./judge";
import type { BidCategory, BidVerdict } from "./types";

const INBOX_URL = "https://work-erp-one.vercel.app/bids";
/** Resend 기본 발신 주소. 도메인 인증 없이 가입한 메일 주소로만 보낼 수 있다 */
const FROM = "ERP 공고 알림 <onboarding@resend.dev>";
/** 수신은 매일 도는데 이보다 오래되면 돌지 않은 것으로 본다 */
const STALE_FETCH_MS = 26 * 3_600_000;

export type DigestNotice = {
  id: string;
  category: BidCategory;
  title: string;
  verdict: BidVerdict;
  verdict_reason: string | null;
  notice_org: string | null;
  presumed_price: number | null;
  closes_at: string | null;
  detail_url: string | null;
  summary: string | null;
  summary_error: string | null;
};

export type DigestStatus = { last_fetched_at: string | null; last_fetch_result: string | null };
export type DigestMail = { subject: string; html: string };

/** 공고명·요약은 외부 문서에서 온 글이므로 그대로 HTML에 넣지 않는다 */
const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const isWebUrl = (url: string) => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

const closesLabel = (at: string | null) =>
  at
    ? new Date(at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    : "마감일 미상";

/** 요약이 아직 안 된 원가 공고. 요약이 끝난 뒤 다시 알려야 한다 */
const summaryPending = (n: DigestNotice) => n.category === "cost" && !n.summary && !n.summary_error;

/** 이번 메일로 알림을 끝낸 공고 */
export const notifiedIds = (notices: DigestNotice[]) => notices.filter((n) => !summaryPending(n)).map((n) => n.id);

/** 아침 수신이 실패했거나 돌지 않았으면 그 내용을 돌려준다 */
export function fetchProblem(status: DigestStatus | null, now: Date) {
  if (!status?.last_fetched_at || now.getTime() - Date.parse(status.last_fetched_at) > STALE_FETCH_MS) {
    return "오늘 공고 수신 기록이 없습니다.";
  }
  return status.last_fetch_result?.includes("실패") ? status.last_fetch_result : null;
}

function summaryHtml(n: DigestNotice) {
  if (n.category !== "cost") return "";
  if (n.summary_error) return `<p style="color:#b91c1c">요약 실패: ${escapeHtml(n.summary_error)} (공고 화면에서 다시 시도할 수 있습니다)</p>`;
  if (!n.summary) return `<p style="color:#b45309">요약 대기: 내일 이어서 요약합니다.</p>`;
  return `<p style="white-space:pre-line;background:#f5f5f5;padding:8px;border-radius:6px">${escapeHtml(n.summary)}</p>`;
}

function noticeHtml(n: DigestNotice) {
  const title = escapeHtml(n.title);
  const link = n.detail_url && isWebUrl(n.detail_url) ? `<a href="${escapeHtml(n.detail_url)}">${title}</a>` : title;
  const facts = [
    VERDICT_LABEL[n.verdict],
    `마감 ${closesLabel(n.closes_at)}`,
    ...(n.notice_org ? [n.notice_org] : []),
    ...(n.presumed_price !== null ? [`추정가격 ${won(Number(n.presumed_price))}`] : []),
  ];
  const reason = n.verdict_reason ? `<br>판정 근거: ${escapeHtml(n.verdict_reason)}` : "";
  return `<li style="margin-bottom:16px"><strong>${link}</strong><br>${facts.map(escapeHtml).join(" · ")}${reason}${summaryHtml(n)}</li>`;
}

/** 알릴 공고도 문제도 없으면 null */
export function buildDigest(notices: DigestNotice[], problems: string[]): DigestMail | null {
  if (notices.length === 0 && problems.length === 0) return null;

  const needsCheck = problems.length + notices.filter((n) => n.summary_error).length;
  const subject = [`[공고 알림] 새 공고 ${notices.length}건`, ...(needsCheck ? [`확인 필요 ${needsCheck}건`] : [])].join(" · ");

  const problemHtml = problems.map((p) => `<p style="color:#b91c1c"><strong>${escapeHtml(p)}</strong></p>`).join("");
  const sections = (Object.keys(CATEGORY_LABEL) as BidCategory[]).flatMap((category) => {
    const rows = notices.filter((n) => n.category === category);
    return rows.length ? [`<h3>${escapeHtml(CATEGORY_LABEL[category])} ${rows.length}건</h3><ul style="padding-left:18px">${rows.map(noticeHtml).join("")}</ul>`] : [];
  });
  const footer = `<p><a href="${INBOX_URL}">ERP 공고 수신함 열기</a></p><p style="color:#666;font-size:12px">AI가 쓴 요약이라 틀릴 수 있습니다. 투찰 전에 원문을 확인하세요.</p>`;

  return { subject, html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${problemHtml}${sections.join("")}${footer}</div>` };
}

/** Resend로 보낸다. 실패하면 throw */
export async function sendDigest(apiKey: string, to: string, mail: DigestMail) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject: mail.subject, html: mail.html }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`메일 발송 실패: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}
