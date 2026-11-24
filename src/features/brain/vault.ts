// 옵시디언 볼트 노트 읽기: PARA 구분, [[링크]]·태그 뽑기, 링크 대상 찾기 (순수 함수)

export const SECTIONS = ["inbox", "projects", "areas", "resources", "archives", "other"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  inbox: "Inbox · 모으기",
  projects: "Projects · 프로젝트",
  areas: "Areas · 영역",
  resources: "Resources · 자료",
  archives: "Archives · 보관",
  other: "기타",
};

/** 새 볼트를 만들 때 만드는 PARA 폴더 (번호를 붙여 옵시디언에서 이 순서로 보이게) */
export const PARA_FOLDERS = ["0 Inbox", "1 Projects", "2 Areas", "3 Resources", "4 Archives"] as const;
/** ERP 기록을 내보내는 폴더 이름 */
export const EXPORT_FOLDER = "ERP 기록";

// 맨 위 폴더 이름으로 PARA 를 가린다: "1 Projects", "01_Projects", "1. 프로젝트", "Projects" 모두
const SECTION_WORDS: [Section, RegExp][] = [
  ["inbox", /^(inbox|인박스|받은|모으기|수집)/],
  ["projects", /^(projects?|프로젝트)/],
  ["areas", /^(areas?|영역)/],
  ["resources", /^(resources?|자료|리소스)/],
  ["archives", /^(archives?|보관|아카이브)/],
];

/** 볼트 안 경로('1 Projects/원가/착수.md') → PARA 구분. 맨 위에 바로 있는 노트는 기타 */
export function sectionOf(path: string): Section {
  const parts = path.split("/");
  if (parts.length < 2) return "other";
  const top = parts[0]
    .trim()
    .toLowerCase()
    .replace(/^[\d\s._\-)]+/, "");
  for (const [section, re] of SECTION_WORDS) if (re.test(top)) return section;
  return "other";
}

/** 파일 이름에서 .md 를 뗀 노트 제목 */
export const noteTitle = (path: string) => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

/** 노트 안 폴더 경로 ('1 Projects/원가') — 맨 위면 '' */
export const noteFolder = (path: string) => path.split("/").slice(0, -1).join("/");

/** 볼트에서 읽지 않을 것: 숨김 폴더(.obsidian, .trash 등)와 .md 가 아닌 파일 */
export const isNotePath = (path: string) => /\.md$/i.test(path) && !path.split("/").some((p) => p.startsWith("."));

/** 맨 앞 --- … --- (frontmatter) 를 떼어 본문과 나눈다 */
export function splitFrontmatter(content: string): { meta: Record<string, string | string[]>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!m) return { meta: {}, body: content };
  const meta: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const cur = meta[listKey];
      meta[listKey] = [...(Array.isArray(cur) ? cur : []), unquote(item[1])];
      continue;
    }
    const kv = /^([A-Za-z0-9_\-가-힣]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    listKey = raw.trim() === "" ? key : null;
    if (listKey) meta[key] = [];
    else if (/^\[.*\]$/.test(raw.trim())) meta[key] = raw.trim().slice(1, -1).split(",").map(unquote).filter(Boolean);
    else meta[key] = unquote(raw);
  }
  return { meta, body: content.slice(m[0].length) };
}

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");

/** 코드 블록·인라인 코드를 지운 본문 (링크·태그를 코드 안에서 잘못 뽑지 않게) */
const withoutCode = (body: string) => body.replace(/```[\s\S]*?(```|$)/g, "").replace(/`[^`\n]*`/g, "");

/** [[링크]] 대상: 'A#제목|별칭' → 'a'. ![[그림.png]] 처럼 노트가 아닌 첨부는 뺀다 */
export function extractLinks(body: string): string[] {
  const out = new Set<string>();
  for (const m of withoutCode(body).matchAll(/\[\[([^\]\n]+?)\]\]/g)) {
    const key = linkKey(m[1]);
    if (key && !/\.(png|jpe?g|gif|webp|svg|pdf|mp4|mov|mp3|m4a|wav|zip|hwpx?|xlsx?|docx?|pptx?)$/i.test(key)) out.add(key);
  }
  return [...out];
}

/** 링크 글자 → 찾는 열쇠 (소문자, #제목·|별칭·.md 뗌) */
export const linkKey = (raw: string) =>
  raw
    .split("|")[0]
    .split("#")[0]
    .trim()
    .replace(/\.md$/i, "")
    .toLowerCase();

/** #태그 (본문 + frontmatter tags). 숫자만인 것(#1)과 제목(# 제목)은 태그가 아니다 */
export function extractTags(body: string, meta: Record<string, string | string[]> = {}): string[] {
  const out = new Set<string>();
  const fm = meta.tags ?? meta.tag;
  for (const t of Array.isArray(fm) ? fm : typeof fm === "string" ? fm.split(/[,\s]+/) : []) {
    const tag = t.replace(/^#/, "").trim();
    if (tag) out.add(tag);
  }
  for (const m of withoutCode(body).matchAll(/(^|[\s(])#([\p{L}\p{N}_/-]+)/gu)) {
    if (!/^\d+$/.test(m[2])) out.add(m[2]);
  }
  return [...out];
}

export type ParsedNote = { path: string; title: string; section: Section; links: string[]; tags: string[] };

export function parseNote(path: string, content: string): ParsedNote {
  const { meta, body } = splitFrontmatter(content);
  return { path, title: noteTitle(path), section: sectionOf(path), links: extractLinks(body), tags: extractTags(body, meta) };
}

/**
 * 링크 열쇠 → 노트 찾기. 옵시디언처럼 경로('폴더/노트')로도, 이름('노트')만으로도 찾는다.
 * 이름이 같은 노트가 여럿이면 경로가 짧은(위쪽) 것.
 */
export function linkResolver<T extends { path: string }>(notes: T[]): (key: string) => T | undefined {
  const byPath = new Map<string, T>();
  const byName = new Map<string, T>();
  const sorted = [...notes].sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  for (const n of sorted) {
    const p = n.path.replace(/\.md$/i, "").toLowerCase();
    byPath.set(p, n);
    const name = p.split("/").pop()!;
    if (!byName.has(name)) byName.set(name, n);
  }
  return (key: string) => byPath.get(key) ?? byName.get(key) ?? byName.get(key.split("/").pop() ?? key);
}

/** 이 노트를 가리키는 노트들 (백링크) */
export function backlinksOf<T extends { path: string; links: string[] }>(target: T, notes: T[]): T[] {
  const resolve = linkResolver(notes);
  return notes.filter((n) => n !== target && n.path !== target.path && n.links.some((k) => resolve(k)?.path === target.path));
}

/** 드라이브 폴더 링크·ID → 폴더 ID. 모르는 모양이면 null */
export function parseFolderId(input: string): string | null {
  const s = input.trim();
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/** 찾은 글자 주변만 잘라 보여 준다 */
export function snippet(content: string, q: string, around = 60): string {
  const text = splitFrontmatter(content).body.replace(/\s+/g, " ").trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text.slice(0, around * 2) + (text.length > around * 2 ? "…" : "");
  const start = Math.max(0, i - around);
  const end = Math.min(text.length, i + q.length + around);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** 옵시디언 앱에서 바로 여는 주소 (PC·모바일에 같은 이름의 볼트가 있을 때) */
export const obsidianUrl = (vault: string, path: string) =>
  `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/i, ""))}`;
