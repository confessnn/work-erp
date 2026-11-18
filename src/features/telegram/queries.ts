import "server-only";
import { requireUser } from "@/lib/supabase/server";

export type TelegramLink = {
  tg_name: string | null;
  notify_morning: boolean;
  notify_events: "all" | "selected" | "off";
  linked_at: string;
};

export async function getTelegramLink(): Promise<TelegramLink | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("telegram_links").select("tg_name, notify_morning, notify_events, linked_at").maybeSingle();
  return (data as TelegramLink | null) ?? null;
}
