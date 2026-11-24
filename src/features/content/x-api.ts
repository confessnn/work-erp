// X(트위터) 공식 API v2. 읽은 글 수만큼 돈이 나가므로 '지난번 이후 새 글'만, 개수 상한을 두고 받는다.
// 토큰은 주소·오류 문구에 넣지 않는다.

const BASE = "https://api.x.com/2";

export type XPost = {
  id: string;
  handle: string;
  text: string;
  lang: string | null;
  posted_at: string | null;
  likes: number;
  reposts: number;
  replies: number;
  views: number | null;
};

type ApiTweet = {
  id: string;
  text: string;
  lang?: string;
  created_at?: string;
  note_tweet?: { text?: string };
  public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; quote_count?: number; impression_count?: number };
};

async function get<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("X 서버에 연결하지 못했습니다.");
  }
  const data = (await res.json().catch(() => null)) as (T & { errors?: { detail?: string; title?: string }[]; detail?: string; title?: string }) | null;
  if (!res.ok) {
    if (res.status === 401) throw new Error("X 토큰이 맞지 않습니다. 개발자 콘솔의 Bearer Token을 다시 넣어 주세요.");
    if (res.status === 402) throw new Error("X API 크레딧이 부족합니다. 개발자 콘솔에서 충전해 주세요.");
    if (res.status === 403) throw new Error("X API 권한이 없습니다. 개발자 콘솔에서 앱과 요금제를 확인해 주세요.");
    if (res.status === 429) throw new Error("X API 요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.");
    throw new Error(`X 오류: ${data?.detail ?? data?.title ?? `HTTP ${res.status}`}`);
  }
  if (!data) throw new Error("X 응답을 읽지 못했습니다.");
  const err = data.errors?.[0];
  // 사용자 조회에서 계정이 없으면 data 없이 errors 만 온다
  if (err && !(data as { data?: unknown }).data) throw new Error(`X 오류: ${err.detail ?? err.title ?? "알 수 없음"}`);
  return data;
}

/** @아이디 → 숫자 사용자 ID (사용자 1명 읽기 요금이 든다. 한 번 찾으면 저장해 둔다) */
export async function lookupUserId(token: string, handle: string): Promise<string> {
  const r = await get<{ data?: { id: string } }>(token, `/users/by/username/${encodeURIComponent(handle)}`);
  if (!r.data?.id) throw new Error(`@${handle} 계정을 찾지 못했습니다.`);
  return r.data.id;
}

export function toPost(t: ApiTweet, handle: string): XPost {
  const m = t.public_metrics ?? {};
  return {
    id: t.id,
    handle,
    text: t.note_tweet?.text || t.text,
    lang: t.lang ?? null,
    posted_at: t.created_at ?? null,
    likes: m.like_count ?? 0,
    reposts: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
    replies: m.reply_count ?? 0,
    views: m.impression_count ?? null,
  };
}

/**
 * 한 사람의 새 글 (리포스트·답글 제외). sinceId 가 없으면 최근 글 max 개만.
 * 돌려주는 reads 는 요금이 붙는 글 수(받은 글 수)다.
 */
export async function fetchNewPosts(token: string, userId: string, handle: string, sinceId: string | null, max: number) {
  const limit = Math.min(100, Math.max(5, Math.floor(max)));
  const params: Record<string, string> = {
    max_results: String(limit),
    exclude: "retweets,replies",
    "tweet.fields": "created_at,public_metrics,lang,note_tweet",
  };
  if (sinceId) params.since_id = sinceId;
  const r = await get<{ data?: ApiTweet[]; meta?: { newest_id?: string; result_count?: number } }>(token, `/users/${userId}/tweets`, params);
  const posts = (r.data ?? []).map((t) => toPost(t, handle));
  // 지난번 이후 새 글이 상한만큼 꽉 찼으면 그보다 오래된 새 글은 받지 못했을 수 있다 (since_id 가 그 뒤로 넘어간다)
  return { posts, newestId: r.meta?.newest_id ?? null, reads: posts.length, capped: !!sinceId && (r.data?.length ?? 0) >= limit };
}

/** 입력한 아이디 정리: '@abc', 'https://x.com/abc' → 'abc' */
export function normalizeHandle(input: string): string | null {
  const s = input.trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/^@/, "").split(/[/?#\s]/)[0];
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : null;
}
