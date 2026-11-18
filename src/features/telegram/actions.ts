"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createHash, randomBytes } from "node:crypto";
import { deleteWebhook, findChatByCode, getBotUsername, getUpdates, sendMessage, setWebhook } from "./api";
import { HELP_TEXT } from "./quick-add";

const WEBHOOK_URL = "https://work-erp-one.vercel.app/api/telegram/webhook";

type Result = { ok: boolean; message: string };
const fail = (e: unknown): Result => ({ ok: false, message: e instanceof Error ? e.message : "알 수 없는 오류" });

/** 1단계: BotFather 토큰 저장. 토큰이 맞는지 텔레그램에 먼저 확인한다 */
export async function saveTelegramToken(form: FormData): Promise<Result> {
  const token = String(form.get("token") ?? "").trim();
  if (!token) return { ok: false, message: "봇 토큰을 붙여 넣어 주세요." };
  try {
    const bot = await getBotUsername(token);
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("set_telegram_token", { p_token: token, p_bot: bot });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/integrations");
    return { ok: true, message: `@${bot} 봇을 확인했습니다. 아래 순서대로 연결해 주세요.` };
  } catch (e) {
    return fail(e);
  }
}

async function myToken() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("my_telegram_token");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("저장된 봇 토큰이 없습니다. 토큰부터 넣어 주세요.");
  return { supabase, token: data as string };
}

/** 2단계: 봇에게 보낸 연결 코드를 찾아 그 대화방으로 연결하고 시험 메시지를 보낸다 */
export async function confirmTelegram(): Promise<Result> {
  try {
    const { supabase, token } = await myToken();
    const { data: link } = await supabase.from("telegram_links").select("link_code").maybeSingle();
    if (!link?.link_code) return { ok: false, message: "연결 코드가 없습니다. 토큰을 다시 넣어 주세요." };
    // '일정 넣기'(웹훅)가 켜져 있으면 getUpdates가 막히므로 먼저 끈다. 연결 뒤 다시 켜면 된다
    await deleteWebhook(token);
    await supabase.rpc("set_telegram_hook", { p_hash: null });
    const chatId = findChatByCode(await getUpdates(token), link.link_code);
    if (!chatId) return { ok: false, message: `봇 대화방에서 코드(${link.link_code})를 찾지 못했습니다. 봇에게 코드를 보낸 뒤 다시 눌러 주세요.` };
    const { error } = await supabase.rpc("link_telegram_chat", { p_chat_id: chatId });
    if (error) return { ok: false, message: error.message };
    await sendMessage(token, chatId, "✅ <b>ERP와 연결됐어요.</b>\n매일 아침 9시쯤 오늘 할 일을 여기로 보내 드릴게요.");
    revalidatePath("/integrations");
    return { ok: true, message: "연결했습니다. 텔레그램에 시험 메시지를 보냈어요." };
  } catch (e) {
    return fail(e);
  }
}

/** 시험 메시지 */
export async function testTelegram(): Promise<Result> {
  try {
    const { supabase, token } = await myToken();
    const { data: link } = await supabase.from("telegram_links").select("chat_id").maybeSingle();
    if (!link?.chat_id) return { ok: false, message: "아직 연결되지 않았습니다." };
    try {
      await sendMessage(token, Number(link.chat_id), "🔔 ERP 시험 메시지예요. 잘 받으셨다면 연결이 정상이에요.");
      await supabase.rpc("record_telegram_result", { p_error: null });
    } catch (e) {
      await supabase.rpc("record_telegram_result", { p_error: e instanceof Error ? e.message : "오류" });
      throw e;
    }
    revalidatePath("/integrations");
    return { ok: true, message: "시험 메시지를 보냈습니다." };
  } catch (e) {
    return fail(e);
  }
}

/** 연결 끊기. 이후 아침 알림은 메일로 간다 */
export async function disconnectTelegram(): Promise<Result> {
  const { supabase, userId } = await requireUser();
  // 일정 넣기(웹훅)도 끈다. 실패해도 연결은 끊는다
  await myToken()
    .then(({ token }) => deleteWebhook(token))
    .catch(() => {});
  const { error } = await supabase.from("telegram_links").delete().eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/integrations");
  return { ok: true, message: "연결을 끊었습니다. 아침 알림은 메일로 갑니다." };
}

/** 텔레그램으로 일정 넣기 켜기·끄기. 켜면 텔레그램이 봇 메시지를 ERP 웹훅으로 보낸다 */
export async function setTelegramInbox(on: boolean): Promise<Result> {
  try {
    const { supabase, token } = await myToken();
    const { data: link } = await supabase.from("telegram_links").select("chat_id").maybeSingle();
    if (!link?.chat_id) return { ok: false, message: "먼저 텔레그램을 연결해 주세요." };
    if (!on) {
      await deleteWebhook(token);
      const { error } = await supabase.rpc("set_telegram_hook", { p_hash: null });
      if (error) return { ok: false, message: error.message };
      revalidatePath("/integrations");
      return { ok: true, message: "텔레그램으로 일정 넣기를 껐어요." };
    }
    // 비밀값은 텔레그램에만 알려 주고, DB에는 해시만 둔다
    const secret = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(secret, "utf8").digest("hex");
    const { error } = await supabase.rpc("set_telegram_hook", { p_hash: hash });
    if (error) return { ok: false, message: error.message };
    try {
      await setWebhook(token, WEBHOOK_URL, secret);
    } catch (e) {
      await supabase.rpc("set_telegram_hook", { p_hash: null });
      throw e;
    }
    await sendMessage(token, Number(link.chat_id), HELP_TEXT).catch(() => {});
    revalidatePath("/integrations");
    return { ok: true, message: "켰어요. 텔레그램에 사용법을 보냈어요. 봇에게 \"내일 3시 치과\"처럼 보내 보세요." };
  } catch (e) {
    return fail(e);
  }
}

/** 일정 알림 범위 (전부 / 🔔 켠 일정만 / 끄기) */
export async function setTelegramEvents(mode: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_telegram_events", { p_mode: mode });
  if (error) return fail(new Error(`저장하지 못했어요: ${error.message}`));
  revalidatePath("/integrations");
  return { ok: true, message: "일정 알림 설정을 저장했어요." };
}
