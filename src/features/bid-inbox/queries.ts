import "server-only";
import { requireUser } from "@/lib/supabase/server";
import type { BidCategory, BidNotice, BidSettings } from "./types";

export type BidTab = "open" | "interested" | "dismissed" | "all";

export async function listBidNotices(tab: BidTab, category?: BidCategory): Promise<BidNotice[]> {
  const { supabase } = await requireUser();
  let q = supabase.from("bid_notices").select("*");
  if (category) q = q.eq("category", category);

  if (tab === "open") {
    // 마감 전이거나 마감일을 모르는 공고 (제외한 것과 불가 판정은 빼고. 불가는 대부분 다른 지역 제한이라 전체 탭에서 본다)
    q = q.neq("status", "dismissed").neq("verdict", "impossible").or(`closes_at.gte.${new Date().toISOString()},closes_at.is.null`);
  } else if (tab !== "all") {
    q = q.eq("status", tab);
  }

  const { data, error } = tab === "open"
    ? await q.order("closes_at", { ascending: true, nullsFirst: false }).limit(200)
    : await q.order("noticed_at", { ascending: false, nullsFirst: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as BidNotice[];
}

/** 공고 한 건. 주소에 잘못된 값이 들어오면 null */
export async function getBidNotice(id: string): Promise<BidNotice | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("bid_notices").select("*").eq("id", id).maybeSingle();
  return (data as BidNotice | null) ?? null;
}

export async function getBidSettings(): Promise<BidSettings | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("bid_settings").select("auto_fetch, last_fetched_at, last_fetch_result").maybeSingle();
  return (data as BidSettings | null) ?? null;
}
