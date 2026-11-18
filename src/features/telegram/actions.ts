"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { BOT_USERNAME, botToken, ensureWebhook, sendTelegram } from "./api";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** 연결 시작: 1회용 코드(10분)를 만들고 봇 주소를 돌려준다. 웹훅도 이때 등록해 둔다 */
export async function startTelegramLink(): Promise<Result<{ url: string }>> {
  if (!botToken()) return { ok: false, error: "텔레그램 봇 토큰이 서버에 없습니다." };
  const { supabase } = await requireUser();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const hook = await ensureWebhook(origin);
  if (!hook.ok) return { ok: false, error: `봇 설정 실패: ${hook.error}` };

  const code = randomBytes(18).toString("hex"); // 36자
  const { error } = await supabase.from("telegram_link_codes").insert({ code });
  if (error) return { ok: false, error: `연결 코드를 만들지 못했어요: ${error.message}` };
  return { ok: true, url: `https://t.me/${BOT_USERNAME}?start=${code}` };
}

export async function saveTelegramSettings(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const events = String(fd.get("notify_events"));
  await supabase
    .from("telegram_links")
    .update({
      notify_morning: fd.get("notify_morning") === "on",
      notify_events: ["all", "selected", "off"].includes(events) ? events : "all",
    })
    .eq("user_id", userId);
  revalidatePath("/integrations");
}

export async function sendTelegramTest(): Promise<Result> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("telegram_links").select("chat_id").maybeSingle();
  if (!data) return { ok: false, error: "텔레그램이 연결되어 있지 않습니다." };
  const r = await sendTelegram(data.chat_id, "🔔 ERP 시험 알림이에요. 잘 오고 있어요!");
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "보내지 못했어요." };
}

export async function unlinkTelegram() {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("telegram_links").select("chat_id").maybeSingle();
  await supabase.from("telegram_links").delete().eq("user_id", userId);
  if (data) await sendTelegram(data.chat_id, "ERP에서 연결을 끊었어요. 더 이상 알림을 보내지 않아요.");
  revalidatePath("/integrations");
}
