// 노트 본문(마크다운)을 화면용 조각으로 나눈다 (순수 함수). HTML 을 만들지 않고 React 가 글자로 그리므로 안전하다.
// 옵시디언에서 많이 쓰는 것만: 제목, 목록·체크박스, 인용·콜아웃, 코드, 표, 구분선, 굵게·기울임·형광펜·취소선, [[링크]], #태그

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold" | "italic" | "mark" | "strike"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "wiki"; target: string; label: string; embed: boolean }
  | { t: "link"; href: string; label: string }
  | { t: "tag"; v: string };

export type ListItem = { indent: number; checked: boolean | null; c: Inline[] };

export type Block =
  | { t: "heading"; level: number; c: Inline[] }
  | { t: "para"; c: Inline[] }
  | { t: "list"; ordered: boolean; items: ListItem[] }
  | { t: "quote"; callout: string | null; title: Inline[]; lines: Inline[][] }
  | { t: "code"; lang: string; v: string }
  | { t: "table"; rows: Inline[][][] }
  | { t: "hr" };

const SAFE_HREF = /^(https?:|mailto:)/i;

// 앞에서부터 가장 먼저 나오는 표시를 찾아 자른다
const INLINE =
  /(`[^`\n]+`)|(!?\[\[[^\]\n]+?\]\])|(\[[^\]\n]+\]\([^)\s]+\))|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(==[^=\n]+?==)|(~~[^~\n]+?~~)|(\*[^*\n]+?\*|(?<![\p{L}\p{N}])_[^_\n]+?_(?![\p{L}\p{N}]))|((?:^|(?<=[\s(]))#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)|(https?:\/\/[^\s<>()]+[^\s<>().,!?])/gu;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (prev?.t === "text") prev.v += v;
    else out.push({ t: "text", v });
  };
  for (const m of src.matchAll(INLINE)) {
    const s = m[0];
    push(src.slice(last, m.index));
    last = m.index! + s.length;
    if (m[1]) out.push({ t: "code", v: s.slice(1, -1) });
    else if (m[2]) {
      const embed = s.startsWith("!");
      const inner = s.slice(embed ? 3 : 2, -2);
      const [target, alias] = inner.split("|");
      out.push({ t: "wiki", target: target.trim(), label: (alias ?? target.split("#")[0] ?? target).trim() || target.trim(), embed });
    } else if (m[3]) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(s)!;
      if (SAFE_HREF.test(mm[2])) out.push({ t: "link", href: mm[2], label: mm[1] });
      else push(s);
    } else if (m[4]) out.push({ t: "bold", c: parseInline(s.slice(2, -2)) });
    else if (m[5]) out.push({ t: "mark", c: parseInline(s.slice(2, -2)) });
    else if (m[6]) out.push({ t: "strike", c: parseInline(s.slice(2, -2)) });
    else if (m[7]) out.push({ t: "italic", c: parseInline(s.slice(1, -1)) });
    else if (m[8]) out.push({ t: "tag", v: s.slice(1) });
    else if (m[9]) out.push({ t: "link", href: s, label: s });
  }
  push(src.slice(last));
  return out;
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => parseInline(c.trim()));

/** frontmatter 를 뗀 본문 → 블록 목록 */
export function parseMarkdown(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "para", c: parseInline(para.join("\n")) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = /^\s*(```|~~~)\s*([\w+-]*)/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) code.push(lines[i]);
      blocks.push({ t: "code", lang: fence[2], v: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ t: "heading", level: h[1].length, c: parseInline(h[2].replace(/\s+#+\s*$/, "")) });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ t: "hr" });
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const raw: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) raw.push(lines[i].replace(/^\s*>\s?/, ""));
      i--;
      const co = /^\[!(\w+)\][+-]?\s*(.*)$/.exec(raw[0] ?? "");
      blocks.push({
        t: "quote",
        callout: co ? co[1].toLowerCase() : null,
        title: co ? parseInline(co[2]) : [],
        lines: (co ? raw.slice(1) : raw).map(parseInline),
      });
      continue;
    }
    if (line.includes("|") && TABLE_SEP.test(lines[i + 1] ?? "")) {
      flush();
      const rows = [cells(line)];
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++) rows.push(cells(lines[i]));
      i--;
      blocks.push({ t: "table", rows });
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const items: ListItem[] = [];
      for (; i < lines.length; i++) {
        const m = LIST.exec(lines[i]);
        // 맨 앞 칸에서 번호 목록 ↔ 글머리 목록이 바뀌면 새 목록
        if (m && items.length && !m[1] && /\d/.test(m[2]) !== ordered) break;
        if (!m) {
          // 목록 항목 다음 줄이 들여쓰기로 이어지면 같은 항목
          if (items.length && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1].c.push({ t: "text", v: ` ${lines[i].trim()}` });
            continue;
          }
          break;
        }
        items.push({
          indent: Math.min(4, Math.floor(m[1].replace(/\t/g, "  ").length / 2)),
          checked: m[3] === undefined ? null : m[3] !== " ",
          c: parseInline(m[4]),
        });
      }
      i--;
      blocks.push({ t: "list", ordered, items });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
