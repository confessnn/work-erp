"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { parseSubscription, parseTarget } from "./keys";

/** 이 휴대폰(브라우저)에서 알림 받기 */
export async function savePushSubscription(sub: unknown, userAgent: string): Promise<{ error?: string }> {
  const s = parseSubscription(sub);
  if (!s) return { error: "알림 등록 정보가 올바르지 않아요." };
  const { supabase, userId } = await requireUser();
  // 같은 휴대폰을 다른 계정으로 쓰다 바꾼 경우를 위해 지우고 다시 넣는다
  await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  const { error } = await supabase
    .from("push_subscriptions")
    .insert({ ...s, user_id: userId, user_agent: userAgent.slice(0, 300) || null });
  return error ? { error: `알림을 켜지 못했어요: ${error.message}` } : {};
}

export async function deletePushSubscription(endpoint: string) {
  const { supabase } = await requireUser();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

/** 브라우저가 구독할 때 쓰는 공개키. 첫 알림 확인(5분마다) 전에는 없을 수 있다. */
export async function getVapidPublicKey(): Promise<string | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("vapid_public_key");
  return typeof data === "string" && data ? data : null;
}

/** 일정 하나의 1시간 전 알림 켜기/끄기 */
export async function setReminder(target: unknown, on: boolean): Promise<{ error?: string }> {
  const t = parseTarget(target);
  if (!t) return { error: "일정 정보가 올바르지 않아요." };
  const { supabase, userId } = await requireUser();
  const { error } = on
    ? await supabase
        .from("event_reminders")
        .upsert({ user_id: userId, kind: t.kind, ref: t.ref, event_date: t.date, notified_at: null }, { onConflict: "user_id,kind,ref" })
    : await supabase.from("event_reminders").delete().eq("kind", t.kind).eq("ref", t.ref).eq("user_id", userId);
  revalidatePath("/family", "layout");
  revalidatePath("/lectures", "layout");
  return error ? { error: error.message } : {};
}
