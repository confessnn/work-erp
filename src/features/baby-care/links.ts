// 아기 링크: 주소 정리, 내부망 주소 막기, 웹페이지에서 제목·설명·본문 뽑기, AI 답 읽기 (순수 함수)

export type BabyLink = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  note: string | null;
  created_at: string;
};
export const LINK_COLUMNS = "id, url, title, description, note, created_at";

/** 사용자가 넣은 주소 정리: 앞뒤 공백, http(s) 없으면 https:// 붙이기. 잘못되면 null */
export function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") || u.username || u.password) return null;
    u.hash = "";
    const out = u.toString();
    return out.length <= 2000 ? out : null;
  } catch {
    return null;
  }
}

/** 서버가 읽으면 안 되는 주소 판별은 lib/net-guard 한 곳에서 (iCal 가져오기와 같이 씀) */
export { isPrivateAddress } from "@/lib/net-guard";

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const squash = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();

function meta(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (name !== key) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content?.trim()) return squash(content);
  }
  return null;
}

export type PageInfo = { title: string | null; description: string | null; text: string };

/** HTML에서 제목·설명·본문(최대 maxText자) */
export function extractPage(html: string, maxText = 6000): PageInfo {
  const title = meta(html, "og:title") ?? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? squash(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]) : null);
  const description = meta(html, "og:description") ?? meta(html, "description");
  const body = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return { title: title || null, description, text: squash(body).slice(0, maxText) };
}

/** 응답의 글자 인코딩 (content-type 또는 <meta charset>). 한국 사이트의 euc-kr도 읽는다 */
export function charsetOf(contentType: string | null, head: string): string {
  const pick = (s: string | null | undefined) => /charset\s*=\s*["']?([\w-]+)/i.exec(s ?? "")?.[1]?.toLowerCase();
  const c = pick(contentType) ?? pick(/<meta[^>]+charset[^>]*>/i.exec(head)?.[0]);
  if (!c) return "utf-8";
  return c === "ks_c_5601-1987" || c === "cp949" ? "euc-kr" : c;
}

/** AI 답 "제목: …\n설명: …" 읽기 */
export function parseDescribe(text: string): { title: string | null; description: string | null } {
  const line = (k: string) => new RegExp(`^\\s*${k}\\s*[:：]\\s*(.+)$`, "m").exec(text)?.[1]?.trim() || null;
  const description = text.includes("설명") ? (/설명\s*[:：]\s*([\s\S]+)/.exec(text)?.[1]?.trim() ?? null) : text.trim() || null;
  return { title: line("제목")?.slice(0, 200) ?? null, description: description?.slice(0, 1000) ?? null };
}

/** 목록에서 i번째를 to번째로 옮긴 새 목록 (범위를 벗어나면 그대로) */
export function moveItem<T>(list: T[], i: number, to: number): T[] {
  if (i === to || i < 0 || i >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(to, 0, x);
  return next;
}
