import type { Metadata } from "next";
import { ContentBoard, type BoardPost, type BoardSettings, type BoardSource } from "@/features/content/components/content-board";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "콘텐츠 창고 · work-erp" };

/** '지금 모으기'는 X 받기·AI 정리·노션 기록을 한 번에 해서 시간이 걸린다 */
export const maxDuration = 300;

export default async function ContentPage() {
  const { supabase } = await requireUser();
  const [{ data: settings }, { data: tokens }, { data: sources }, { data: posts }] = await Promise.all([
    supabase.from("content_settings").select("enabled, fields, daily_budget, notion_parent, notion_db, reads_day, reads_count, last_run_at, last_result").maybeSingle(),
    supabase.rpc("my_content_tokens"),
    supabase.from("x_sources").select("id, handle, field, active, last_fetched_at, last_error").order("created_at"),
    supabase
      .from("x_posts")
      .select("id, handle, text, posted_at, likes, reposts, views, status, field, summary, translation, idea, idea_score, notion_page")
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(200),
  ]);
  const [t] = (tokens ?? []) as { has_x: boolean; has_notion: boolean }[];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">콘텐츠 창고</h1>
        <p className="text-sm text-muted">X 인플루언서 글 → AI 정리 → 노션 · 고른 글로 초안 만들기</p>
      </div>
      <ContentBoard
        settings={(settings as BoardSettings | null) ?? null}
        hasX={!!t?.has_x}
        hasNotion={!!t?.has_notion}
        sources={(sources ?? []) as BoardSource[]}
        posts={(posts ?? []) as BoardPost[]}
      />
    </>
  );
}
