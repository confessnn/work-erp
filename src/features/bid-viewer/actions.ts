"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getBidViewer } from "./queries";

export type ViewerFormState = { error?: string };

/** 동생 초대 링크 만들기 (7일, 한 번만 사용) — 공고함 주인만 */
export async function createBidViewerInvite(_prev: ViewerFormState, fd: FormData): Promise<ViewerFormState> {
  if (await getBidViewer()) return { error: "초대받은 계정에서는 초대할 수 없어요." };
  const { supabase } = await requireUser();
  const label = String(fd.get("label") ?? "").trim().slice(0, 30) || "동생";
  const { error } = await supabase.from("bid_viewer_invites").insert({ token: randomBytes(24).toString("hex"), label });
  if (error) return { error: `초대 링크를 만들지 못했어요: ${error.message}` };
  revalidatePath("/bids");
  return {};
}

export async function deleteBidViewerInvite(token: string) {
  const { supabase } = await requireUser();
  await supabase.from("bid_viewer_invites").delete().eq("token", token);
  revalidatePath("/bids");
}

/** 공유 끊기: 그 계정은 즉시 공고를 볼 수 없게 된다 */
export async function removeBidViewer(memberId: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("bid_viewers").delete().eq("member_id", memberId).eq("owner_id", userId);
  revalidatePath("/bids");
}

/** 초대 수락 */
export async function acceptBidViewerInvite(token: string): Promise<ViewerFormState> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_bid_viewer_invite", { p_token: token });
  if (error) return { error: `참여하지 못했어요: ${error.message}` };
  if (typeof data === "string" && data) return { error: data };
  revalidatePath("/", "layout");
  redirect("/bids");
}

/** 열람자 본인의 관심·제외 표시 (초대한 사람의 공고함 상태는 바꾸지 않음) */
export async function setViewerMark(noticeId: string, status: "new" | "interested" | "dismissed") {
  const { supabase, userId } = await requireUser();
  if (status === "new") {
    await supabase.from("bid_viewer_marks").delete().eq("notice_id", noticeId);
  } else {
    await supabase
      .from("bid_viewer_marks")
      .upsert({ member_id: userId, notice_id: noticeId, status, updated_at: new Date().toISOString() });
  }
  revalidatePath("/bids");
}
