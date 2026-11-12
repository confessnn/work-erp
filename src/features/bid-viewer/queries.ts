import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/supabase/server";
import type { BidNotice, BidStatus } from "@/features/bid-inbox/types";
import { filterViewerTab, type ViewerTab } from "./tabs";

/** 로그인한 사람이 초대받은 '공고 열람자'(예: 동생)인지 */
export const getBidViewer = cache(async (): Promise<{ ownerId: string; label: string } | null> => {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("bid_viewers").select("owner_id, label").eq("member_id", userId).maybeSingle();
  return data ? { ownerId: data.owner_id as string, label: data.label as string } : null;
});

/**
 * 열람자가 보는 공고: 초대한 사람의 '나라장터 한일ENG' 공고 (불가 판정 포함).
 * DB 정책(bid_notices_select_viewer)이 이 범위만 돌려준다. 관심·제외는 열람자 본인의 표시로 바꿔 보여 준다.
 */
export async function listViewerNotices(tab: ViewerTab): Promise<BidNotice[]> {
  const { supabase } = await requireUser();
  const [{ data: rows, error }, { data: marks }] = await Promise.all([
    supabase
      .from("bid_notices")
      .select("*")
      .eq("category", "hanil")
      .eq("source", "g2b")
      .order("noticed_at", { ascending: false, nullsFirst: false })
      .limit(400),
    supabase.from("bid_viewer_marks").select("notice_id, status"),
  ]);
  if (error) throw new Error(error.message);
  const markOf = new Map((marks ?? []).map((m) => [m.notice_id as string, m.status as BidStatus]));
  const notices = ((rows ?? []) as BidNotice[]).map((n) => ({ ...n, status: markOf.get(n.id) ?? ("new" as BidStatus) }));
  return filterViewerTab(notices, tab, Date.now());
}

export type BidViewerInvite = { token: string; label: string; expires_at: string };
export type BidViewerMember = { member_id: string; label: string; created_at: string };

/** 초대한 사람의 관리 화면용 */
export async function listBidViewerAdmin() {
  const { supabase, userId } = await requireUser();
  const [inv, mem] = await Promise.all([
    supabase
      .from("bid_viewer_invites")
      .select("token, label, expires_at")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("bid_viewers").select("member_id, label, created_at").eq("owner_id", userId).order("created_at"),
  ]);
  return { invites: (inv.data ?? []) as BidViewerInvite[], members: (mem.data ?? []) as BidViewerMember[] };
}
