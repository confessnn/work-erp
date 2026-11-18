// 노션 API. 사용자가 만든 '연결(Integration)' 토큰으로, 연결해 둔 페이지 아래에 'X 인사이트' 데이터베이스를 만들고 글을 한 줄씩 적는다.
// 노션은 초당 약 3번까지만 받으므로 요청 사이를 띄운다.

const BASE = "https://api.notion.com/v1";
const VERSION = "2022-06-28";
const GAP_MS = 350;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(token: string, method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("노션 서버에 연결하지 못했습니다.");
    }
    await sleep(GAP_MS);
    if (res.status === 429 && attempt < 3) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!res.ok) {
      if (res.status === 401) throw new Error("노션 토큰이 맞지 않습니다. 연결(Integration)의 토큰을 다시 넣어 주세요.");
      if (res.status === 404) throw new Error("노션 페이지를 찾지 못했습니다. 그 페이지의 ⋯ → 연결에서 만든 연결을 추가했는지 확인해 주세요.");
      throw new Error(`노션 오류: ${data?.message ?? `HTTP ${res.status}`}`);
    }
    return data as T;
  }
}

/** 노션 페이지 주소나 ID에서 32자리 ID를 뽑는다 */
export function parseNotionId(input: string): string | null {
  const m = input.replace(/-/g, "").match(/([0-9a-f]{32})(?:[?#].*)?$/i) ?? input.replace(/-/g, "").match(/([0-9a-f]{32})/i);
  return m ? m[1].toLowerCase() : null;
}

/** 토큰 확인: 연결(봇) 이름 */
export async function whoAmI(token: string): Promise<string> {
  const me = await call<{ name?: string }>(token, "GET", "/users/me");
  return me.name ?? "노션 연결";
}

/** 연결된 페이지 제목 (연결이 잘 됐는지 확인용) */
export async function pageTitle(token: string, pageId: string): Promise<string> {
  const p = await call<{ properties?: Record<string, { type: string; title?: { plain_text: string }[] }> }>(token, "GET", `/pages/${pageId}`);
  const t = Object.values(p.properties ?? {}).find((v) => v.type === "title");
  return t?.title?.map((x) => x.plain_text).join("") || "(제목 없음)";
}

const rt = (s: string | null | undefined) => (s ? [{ type: "text", text: { content: s.slice(0, 1990) } }] : []);

/** 'X 인사이트' 데이터베이스 만들기. 만든 DB ID를 돌려준다 */
export async function createInsightDb(token: string, parentPage: string): Promise<string> {
  const db = await call<{ id: string }>(token, "POST", "/databases", {
    parent: { type: "page_id", page_id: parentPage },
    title: rt("X 인사이트"),
    properties: {
      요약: { title: {} },
      분야: { select: {} },
      작성자: { rich_text: {} },
      아이디어: { rich_text: {} },
      점수: { number: {} },
      좋아요: { number: {} },
      리포스트: { number: {} },
      조회: { number: {} },
      작성일: { date: {} },
      원문: { url: {} },
    },
  });
  return db.id;
}

export type InsightRow = {
  id: string;
  handle: string;
  text: string;
  posted_at: string | null;
  likes: number;
  reposts: number;
  views: number | null;
  field: string | null;
  summary: string | null;
  translation: string | null;
  idea: string | null;
  idea_score: number | null;
};

export const postUrl = (handle: string, id: string) => `https://x.com/${handle}/status/${id}`;

const para = (s: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rt(s) } });
const heading = (s: string) => ({ object: "block", type: "heading_3", heading_3: { rich_text: rt(s) } });

/** 글 한 개를 DB에 한 줄로. 본문(원문·번역)은 페이지 안에 */
export async function addInsight(token: string, dbId: string, r: InsightRow): Promise<string> {
  const props: Record<string, unknown> = {
    요약: { title: rt(r.summary || r.text.slice(0, 80)) },
    작성자: { rich_text: rt(`@${r.handle}`) },
    아이디어: { rich_text: rt(r.idea) },
    점수: { number: r.idea_score },
    좋아요: { number: r.likes },
    리포스트: { number: r.reposts },
    조회: { number: r.views },
    원문: { url: postUrl(r.handle, r.id) },
  };
  if (r.field) props.분야 = { select: { name: r.field.replace(/,/g, " ").slice(0, 100) } };
  if (r.posted_at) props.작성일 = { date: { start: r.posted_at } };
  const children = [heading("원문"), ...chunks(r.text).map(para)];
  if (r.translation) children.push(heading("번역"), ...chunks(r.translation).map(para));
  const page = await call<{ id: string }>(token, "POST", "/pages", { parent: { database_id: dbId }, properties: props, children: children.slice(0, 90) });
  return page.id;
}

/** 노션 글 덩어리는 2000자까지라 나눈다 */
export function chunks(s: string, size = 1900): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.length ? out : [""];
}

/** 콘텐츠 초안을 연결 페이지 아래 새 페이지로. 페이지 주소를 돌려준다 */
export async function addDraftPage(token: string, parentPage: string, title: string, body: string, sources: string[]): Promise<string> {
  const blocks: Record<string, unknown>[] = body
    .split(/\n{2,}/)
    .flatMap((p) => chunks(p.trim()))
    .filter(Boolean)
    .map(para);
  if (sources.length) blocks.push(heading("참고한 글"), ...sources.map((u) => para(u)));
  const page = await call<{ id: string; url?: string }>(token, "POST", "/pages", {
    parent: { page_id: parentPage },
    properties: { title: { title: rt(title) } },
    children: blocks.slice(0, 95),
  });
  return page.url ?? `https://www.notion.so/${page.id.replace(/-/g, "")}`;
}
