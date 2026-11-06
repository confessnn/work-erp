import Anthropic from "@anthropic-ai/sdk";
import type { ApiProvider, DailyUsage } from "./types";

const DAY_MS = 86_400_000;
/** 한 번에 가져오는 기간 (Anthropic 한도 31일) */
const WINDOW_DAYS = 31;
const OPENAI_BASE = "https://api.openai.com/v1/organization";

export const ADMIN_KEY_ENV: Record<ApiProvider, string> = {
  anthropic: "ANTHROPIC_ADMIN_KEY",
  openai: "OPENAI_ADMIN_KEY",
};

export const hasAdminKey = (provider: ApiProvider) => Boolean(process.env[ADMIN_KEY_ENV[provider]]);

/** 오늘까지 포함하는 UTC 날짜 범위. 끝은 내림 처리되므로 내일 0시로 잡는다 */
export function usageRange(now: Date) {
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return { start: new Date(tomorrow - WINDOW_DAYS * DAY_MS), end: new Date(tomorrow) };
}

/** 날짜별 비용과 토큰을 합친다. 토큰을 못 받은 날은 null */
export function mergeDaily(costs: Map<string, number>, tokens: Map<string, number> | null): DailyUsage[] {
  const days = new Set([...costs.keys(), ...(tokens?.keys() ?? [])]);
  return [...days].sort().map((day) => ({ day, cost_cents: costs.get(day) ?? 0, tokens: tokens ? (tokens.get(day) ?? 0) : null }));
}

function add(map: Map<string, number>, day: string, value: number) {
  map.set(day, (map.get(day) ?? 0) + value);
}

async function fetchAnthropic(key: string, now: Date): Promise<DailyUsage[]> {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20_000 });
  const { start, end } = usageRange(now);
  const range = { starting_at: start.toISOString(), ending_at: end.toISOString(), time_bucket_width: "1d", order_by: "time" } as const;

  const costs = new Map<string, number>();
  for await (const row of client.beta.organization.analytics.cost.list(range)) {
    add(costs, row.starting_at.slice(0, 10), Number(row.cost.amount));
  }
  const tokens = new Map<string, number>();
  for await (const row of client.beta.organization.analytics.usage.list(range)) {
    add(tokens, row.starting_at.slice(0, 10), row.usage.total_tokens);
  }
  return mergeDaily(costs, tokens);
}

type OpenAiBucket = { start_time: number; results: Record<string, unknown>[] };

/** OpenAI 조직 조회. 페이지를 끝까지 받는다. 오류 메시지에는 정해진 칸만 쓴다 */
async function openAiBuckets(key: string, path: string, params: Record<string, string>): Promise<OpenAiBucket[]> {
  const buckets: OpenAiBucket[] = [];
  let page: string | null = null;
  do {
    const query = new URLSearchParams({ bucket_width: "1d", limit: String(WINDOW_DAYS), ...params, ...(page ? { page } : {}) });
    const res: Response = await fetch(`${OPENAI_BASE}/${path}?${query}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => null)) as { data?: OpenAiBucket[]; has_more?: boolean; next_page?: string | null; error?: { message?: string } } | null;
    if (!res.ok || !body) throw new Error(`OpenAI 조회 오류 ${res.status}: ${body?.error?.message ?? "응답을 읽을 수 없음"}`);
    buckets.push(...(body.data ?? []));
    page = body.has_more ? (body.next_page ?? null) : null;
  } while (page);
  return buckets;
}

const bucketDay = (b: OpenAiBucket) => new Date(b.start_time * 1000).toISOString().slice(0, 10);

/** 달러 → 센트 */
export function openAiCosts(buckets: OpenAiBucket[]) {
  const costs = new Map<string, number>();
  for (const b of buckets) {
    for (const r of b.results) add(costs, bucketDay(b), Number((r.amount as { value?: unknown } | undefined)?.value ?? 0) * 100);
  }
  return costs;
}

export function openAiTokens(buckets: OpenAiBucket[]) {
  const tokens = new Map<string, number>();
  for (const b of buckets) {
    for (const r of b.results) add(tokens, bucketDay(b), Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0));
  }
  return tokens;
}

async function fetchOpenAi(key: string, now: Date): Promise<DailyUsage[]> {
  const { start, end } = usageRange(now);
  const params = { start_time: String(start.getTime() / 1000), end_time: String(end.getTime() / 1000) };
  const costs = openAiCosts(await openAiBuckets(key, "costs", params));
  // 토큰은 보조 정보라 조회가 막혀도 비용은 저장한다
  const tokens = await openAiBuckets(key, "usage/completions", params).then(openAiTokens, () => null);
  return mergeDaily(costs, tokens);
}

/** 한 서비스의 최근 사용량. 관리자 키가 없으면 null */
export async function fetchDailyUsage(provider: ApiProvider, now = new Date()): Promise<DailyUsage[] | null> {
  const key = process.env[ADMIN_KEY_ENV[provider]];
  if (!key) return null;
  return provider === "anthropic" ? fetchAnthropic(key, now) : fetchOpenAi(key, now);
}
