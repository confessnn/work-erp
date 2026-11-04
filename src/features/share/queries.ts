import "server-only";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import type { SharedEvent } from "./feed";

export type ShareLink = {
  id: string;
  label: string;
  token: string;
  show_organization: boolean;
  created_at: string;
};

export async function listShareLinks(): Promise<ShareLink[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("share_links")
    .select("id, label, token, show_organization, created_at")
    .order("created_at");
  return (data ?? []) as ShareLink[];
}

/**
 * 로그인 없이 공유 토큰으로 일정만 읽는다 (DB 함수 get_shared_schedule).
 * 함수가 금액 컬럼을 아예 반환하지 않으므로 공유 화면에 강의료가 나갈 수 없다.
 * 토큰이 틀리거나 링크가 삭제됐으면 null.
 */
export async function getSharedSchedule(token: string): Promise<{ label: string; events: SharedEvent[] } | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const [{ data, error }, { data: label }] = await Promise.all([
    supabase.rpc("get_shared_schedule", { p_token: token }),
    supabase.rpc("get_share_label", { p_token: token }),
  ]);
  if (error || typeof label !== "string") return null;
  return { label, events: (data ?? []) as SharedEvent[] };
}
