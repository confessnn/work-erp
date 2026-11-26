import "server-only";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { buildFeed, type Feed, type WidgetRow } from "./feed";

export type WidgetToken = { id: string; label: string; token: string; last_used_at: string | null; created_at: string };

/** 내가 만든 위젯 토큰 (설정 화면) */
export async function listWidgetTokens(): Promise<WidgetToken[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("widget_tokens")
    .select("id, label, token, last_used_at, created_at")
    .order("created_at");
  return (data ?? []) as WidgetToken[];
}

/**
 * 로그인 없이 토큰으로 일정만 읽는다 (DB 함수 get_widget_schedule).
 * 함수가 금액 컬럼을 아예 반환하지 않으므로 위젯으로 강의료가 나갈 수 없다.
 * 토큰이 틀리거나 지워졌으면 빈 목록이 와서 null 로 돌려준다.
 */
export async function getWidgetFeed(token: string): Promise<Feed | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  // 먼저 토큰이 살아 있는지 본다. 없는 토큰에 빈 목록을 주면
  // 위젯이 '주소가 틀림'을 '일정 없음'으로 잘못 그린다.
  const { data: alive, error: touchError } = await supabase.rpc("touch_widget_token", { p_token: token });
  if (touchError || alive !== true) return null;

  const { data, error } = await supabase.rpc("get_widget_schedule", { p_token: token });
  if (error) return null;
  return buildFeed((data ?? []) as WidgetRow[], new Date());
}
