// 빠른 메모: ERP에서 적은 글 → 볼트 Inbox 의 .md 노트 (순수 함수)
import { safeFileName } from "./export";
import { splitFrontmatter } from "./vault";

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

/** ERP(빠른 메모·텔레그램)가 만든 메모인지: 이것만 ERP에서 고치고 지울 수 있다 (드라이브 drive.file 권한) */
export function isErpMemo(content: string): boolean {
  const { meta } = splitFrontmatter(content);
  return meta.source === "work-erp" && meta.type === "memo";
}

/** 고칠 때 보여 줄 본문 (frontmatter 를 뗀 것) */
export const memoBody = (content: string) => splitFrontmatter(content).body.replace(/\n+$/, "");

/**
 * 메모 본문 바꾸기: frontmatter 는 그대로 두고 updated 만 새로 적는다. 파일 이름은 바꾸지 않는다 (링크가 깨지지 않게).
 * null: 본문이 비었음 (지우기를 쓰도록)
 */
export function editMemo(content: string, newBody: string, now: Date): string | null {
  const body = newBody.replace(/\r\n?/g, "\n").trim().slice(0, MEMO_MAX);
  if (!body) return null;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  const { day, time } = seoulStamp(now);
  const lines = (m ? m[1].split(/\r?\n/) : ["source: work-erp", "type: memo"]).filter((l) => !/^updated\s*:/.test(l));
  const at = lines.findIndex((l) => /^created\s*:/.test(l));
  lines.splice(at >= 0 ? at + 1 : lines.length, 0, `updated: ${day} ${time}`);
  return ["---", ...lines, "---", body, ""].join("\n");
}

/** 텔레그램 글이 메모면 메모 내용: '메모 …', '메모: …', '/memo …' (첫 줄 맨 앞). 아니면 null */
export function telegramMemoText(text: string): string | null {
  const m = /^\s*(?:\/memo(?:@\w+)?|메모)(?:\s*[:：]\s*|\s+)([\s\S]+)$/i.exec(text);
  const body = m?.[1].trim();
  return body ? body : null;
}
