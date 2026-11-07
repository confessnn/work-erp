import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { reminderKey, type ReminderKind } from "./keys";

/** 내가 알림을 켠 일정 키 목록 (아직 보내지 않은 것) */
export async function listMyReminderKeys(): Promise<string[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("event_reminders").select("kind, ref").is("notified_at", null);
  return (data ?? []).map((r) => reminderKey(r.kind as ReminderKind, r.ref as string));
}
