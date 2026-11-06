"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { fetchAllNotices } from "./fetch-all";
import { summarizeNotice } from "./summarize";
import type { BidStatus } from "./types";

/** '지금 수신' 버튼. 처음 누르면 설정 행이 생겨 매일 자동 수신도 시작된다. */
export async function fetchBidsNow(): Promise<{ message: string; failed?: boolean }> {
  const { supabase, userId } = await requireUser();

  const { data: known } = await supabase
    .from("bid_checked")
    .select("check_key")
    .order("created_at", { ascending: false })
    .limit(1000);
  const results = await fetchAllNotices(new Set((known ?? []).map((k) => k.check_key as string)));

  const parts: string[] = [];
  let failed = false;
  for (const r of results) {
    let added = 0;
    if (r.rows.length) {
      const { data, error } = await supabase
        .from("bid_notices")
        .upsert(r.rows, { onConflict: "user_id,category,bid_no,bid_ord", ignoreDuplicates: true })
        .select("id");
      if (error) {
        parts.push(`${r.label} 저장 실패: ${error.message}`);
        failed = true;
        continue;
      }
      added = data?.length ?? 0;
    }
    if (r.checked?.length) {
      await supabase
        .from("bid_checked")
        .upsert(r.checked.map((check_key) => ({ check_key })), { onConflict: "user_id,check_key", ignoreDuplicates: true });
    }
    if (r.error) failed = true;
    parts.push(
      r.error
        ? `${r.label} 수신 실패: ${r.error}`
        : `${r.label} ${r.rows.length}건 확인, ${added}건 새로 수신${r.note ? ` (${r.note})` : ""}`,
    );
  }
  const message = parts.join(" / ");

  await supabase.from("bid_settings").upsert(
    { user_id: userId, last_fetched_at: new Date().toISOString(), last_fetch_result: message },
    { onConflict: "user_id" },
  );
  revalidatePath("/bids");
  return { message, failed };
}

/** '요약 만들기' 버튼. 아침 수신 전이거나 실패한 공고를 바로 요약한다 */
export async function summarizeBid(id: string) {
  const { supabase } = await requireUser();
  const { data: notice, error } = await supabase.from("bid_notices").select("bid_no, bid_ord, title").eq("id", id).single();
  if (error) throw new Error(error.message);

  const saved = await summarizeNotice(notice.bid_no, notice.bid_ord, notice.title).then(
    (r) => ({ summary: r.summary, summary_files: r.files, summary_error: null }),
    (e) => ({ summary: null, summary_files: null, summary_error: e instanceof Error ? e.message : "알 수 없는 오류" }),
  );
  const { error: e2 } = await supabase
    .from("bid_notices")
    .update({ ...saved, summarized_at: new Date().toISOString() })
    .eq("id", id);
  if (e2) throw new Error(e2.message);
  revalidatePath("/bids");
}

export async function setBidStatus(id: string, status: BidStatus) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("bid_notices").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/bids");
}
