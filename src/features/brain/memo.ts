// 빠른 메모: ERP에서 적은 글 → 볼트 Inbox 의 .md 노트 (순수 함수)
import { safeFileName } from "./export";

export const MEMO_MAX = 10_000;
const TITLE_MAX = 40;

/** 서울 시각 → { day: '2026-11-24', time: '14:05', stamp: '2026-11-24 1405' } */
export function seoulStamp(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const day = `${p.year}-${p.month}-${p.day}`;
  return { day, time: `${p.hour}:${p.minute}`, stamp: `${day} ${p.hour}${p.minute}` };
}

/** 메모 제목: 적은 제목, 없으면 첫 줄 (마크다운 표시는 떼고 40자까지) */
export function memoTitle(text: string, title?: string): string {
  const raw = (title?.trim() || text.split("\n").find((l) => l.trim()) || "")
    .replace(/^#+\s*/, "")
    .replace(/^[-*>]\s*/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/[*_`=~]/g, "")
    .trim();
  return raw.length > TITLE_MAX ? `${raw.slice(0, TITLE_MAX).trim()}…` : raw;
}

/**
 * 메모 노트. 파일 이름은 '2026-11-24 1405 제목.md' (시간순으로 정렬되고 겹치지 않게).
 * null: 적은 내용이 없음
 */
export function memoNote(text: string, now: Date, title?: string): { fileName: string; content: string; title: string } | null {
  const body = text.replace(/\r\n?/g, "\n").trim().slice(0, MEMO_MAX);
  if (!body) return null;
  const t = memoTitle(body, title) || "메모";
  const { day, time, stamp } = seoulStamp(now);
  const fileName = `${safeFileName(`${stamp} ${t}`.replace(/…$/, ""))}.md`;
  // 제목을 따로 적었을 때만 본문 위에 제목 줄을 둔다 (첫 줄이 제목이면 본문에 이미 있음)
  const head = title?.trim() ? [`# ${t}`, ""] : [];
  const content = ["---", "source: work-erp", "type: memo", `created: ${day} ${time}`, "tags:", "  - erp/메모", "---", ...head, body, ""].join("\n");
  return { fileName, content, title: t };
}
