// 콘텐츠 창고 한 번 돌리기: X 새 글 받기 → AI 정리 → 노션 기록.
// 화면의 '지금 모으기'(로그인 클라이언트)와 매일 크론(비밀값 + 사용자)이 같은 함수를 쓴다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePosts, type PendingPost } from "./ai";
import { addInsight, createInsightDb, type InsightRow } from "./notion";
import { fetchNewPosts, lookupUserId } from "./x-api";

export type Ctx = { db: SupabaseClient; secret: string | null; user: string | null; deadline: number };
type Job = { x_token: string | null; notion_token: string | null; notion_parent: string | null; notion_db: string | null; fields: string[]; daily_budget: number; reads_today: number };
type Source = { id: string; handle: string; field: string | null; x_user_id: string | null; since_id: string | null };

export type RunResult = { fetched: number; added: number; analyzed: number; synced: number; problems: string[]; top: InsightRow[] };

const rpc = async <T>(c: Ctx, fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await c.db.rpc(fn, { p_secret: c.secret, p_user: c.user, ...args });
  if (error) throw new Error(error.message);
  return data as T;
};

/** 첫 수집(아직 since_id 없음)은 최근 5개만, 그 뒤엔 남은 예산 안에서 최대 20개 */
export function perSourceMax(firstTime: boolean, remaining: number) {
  return Math.min(firstTime ? 5 : 20, remaining);
}

export async function runContent(c: Ctx): Promise<RunResult> {
  const [job] = await rpc<Job[]>(c, "content_job");
  const r: RunResult = { fetched: 0, added: 0, analyzed: 0, synced: 0, problems: [], top: [] };
  if (!job) return r;

  // 1) 받기
  if (job.x_token) {
    let remaining = job.daily_budget - job.reads_today;
    const sources = await rpc<Source[]>(c, "content_sources");
    for (const s of sources) {
      if (Date.now() > c.deadline - 120_000) break;
      if (remaining < 5) {
        r.problems.push(`하루 예산(${job.daily_budget}개)을 다 써서 나머지는 내일 받아요.`);
        break;
      }
      let xUserId = s.x_user_id;
      try {
        if (!xUserId) xUserId = await lookupUserId(job.x_token, s.handle);
        const got = await fetchNewPosts(job.x_token, xUserId, s.handle, s.since_id, perSourceMax(!s.since_id, remaining));
        remaining -= got.reads;
        r.fetched += got.reads;
        if (got.capped) r.problems.push(`@${s.handle}: 새 글이 많아 최근 ${got.reads}개만 받았어요 (그보다 앞선 글은 건너뜀).`);
        r.added += await rpc<number>(c, "content_save_fetch", {
          p_source: s.id, p_x_user_id: xUserId, p_since_id: got.newestId, p_reads: got.reads, p_posts: got.posts, p_error: null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "알 수 없는 오류";
        r.problems.push(`@${s.handle}: ${msg}`);
        await rpc(c, "content_save_fetch", { p_source: s.id, p_x_user_id: xUserId, p_since_id: null, p_reads: 0, p_posts: null, p_error: msg }).catch(() => {});
        // 토큰·크레딧 문제는 모든 사람에게 같으니 멈춘다
        if (/토큰|크레딧|권한/.test(msg)) break;
      }
    }
  } else {
    r.problems.push("X 토큰이 없어서 새 글은 받지 않았어요.");
  }

  // 2) AI 정리 (20개씩)
  while (Date.now() < c.deadline - 90_000) {
    const pending = await rpc<PendingPost[]>(c, "content_pending", { p_limit: 20 });
    if (!pending.length) break;
    try {
      const rows = await analyzePosts(pending, job.fields ?? []);
      const done = new Set(rows.map((x) => x.id));
      const failed = pending.filter((p) => !done.has(p.id)).map((p) => p.id);
      await rpc(c, "content_save_analysis", { p_rows: rows, p_failed: failed.length ? failed : null, p_error: failed.length ? "AI 결과에 빠짐" : null });
      r.analyzed += rows.length;
      if (!rows.length) break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "알 수 없는 오류";
      await rpc(c, "content_save_analysis", { p_rows: null, p_failed: pending.map((p) => p.id), p_error: msg });
      r.problems.push(`AI 정리: ${msg}`);
      break;
    }
  }

  // 3) 노션 기록
  if (job.notion_token && job.notion_parent) {
    let dbId = job.notion_db;
    try {
      const rows = await rpc<InsightRow[]>(c, "content_unsynced", { p_limit: 60 });
      if (rows.length && !dbId) {
        dbId = await createInsightDb(job.notion_token, job.notion_parent);
        await rpc(c, "content_mark_synced", { p_rows: null, p_notion_db: dbId });
      }
      const synced: { id: string; page: string }[] = [];
      // 노션에 넣은 것은 중간에 실패해도 꼭 표시한다 (안 하면 다음번에 같은 글이 또 들어간다)
      const flush = async () => {
        if (!synced.length) return;
        const batch = synced.splice(0);
        await rpc(c, "content_mark_synced", { p_rows: batch, p_notion_db: null });
        r.synced += batch.length;
      };
      try {
        for (const row of rows) {
          if (Date.now() > c.deadline - 20_000) break;
          synced.push({ id: row.id, page: await addInsight(job.notion_token, dbId!, row) });
          if (synced.length >= 10) await flush();
        }
      } finally {
        await flush();
      }
      r.top = [...rows].sort((a, b) => (b.idea_score ?? 0) - (a.idea_score ?? 0) || b.likes - a.likes).slice(0, 3);
    } catch (e) {
      r.problems.push(`노션: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    }
  } else {
    r.problems.push("노션이 연결되지 않아 ERP에만 쌓았어요.");
  }

  await rpc(c, "content_finish", { p_result: resultText(r) }).catch(() => {});
  return r;
}

export function resultText(r: RunResult) {
  const head = `받은 글 ${r.fetched}개(새 글 ${r.added}) · AI 정리 ${r.analyzed} · 노션 ${r.synced}`;
  return r.problems.length ? `${head} · 확인할 점: ${r.problems.join(" / ")}` : head;
}
