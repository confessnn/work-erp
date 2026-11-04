"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "./crypto";
import { revokeToken } from "./google-api";
import { pushToGoogle } from "./push";

export type PushState = { message?: string; error?: string };

export async function pushNow(): Promise<PushState> {
  const { supabase } = await requireUser();
  const r = await pushToGoogle(supabase, { force: true });
  revalidatePath("/integrations");
  if (!r) return { error: "구글 캘린더가 연결되어 있지 않습니다." };
  if (r.error) return { error: r.error };
  return { message: `반영 완료: 추가 ${r.created} · 수정 ${r.updated} · 삭제 ${r.deleted}` };
}

export async function setShowAmounts(show: boolean) {
  const { supabase, userId } = await requireUser();
  await supabase.from("google_connections").update({ show_amounts: show }).eq("user_id", userId);
  // 메모 내용이 바뀌므로 전부 다시 반영
  await pushToGoogle(supabase, { force: true });
  revalidatePath("/integrations");
}

/** 연결 해제: 구글 권한 취소 + 저장된 토큰 삭제. 구글의 '강의 일정(ERP)' 캘린더는 남겨둔다. */
export async function disconnectGoogle() {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("google_connections").select("refresh_token_enc").maybeSingle();
  if (data) {
    try {
      await revokeToken(decryptSecret(data.refresh_token_enc));
    } catch {
      /* 키 문제 등으로 복호화 실패해도 연결 정보는 지운다 */
    }
  }
  await supabase.from("google_connections").delete().eq("user_id", userId);
  await supabase.from("google_pending_deletes").delete().eq("user_id", userId);
  await supabase.from("lectures").update({ google_event_id: null, google_synced_at: null }).not("google_event_id", "is", null);
  revalidatePath("/integrations");
}
