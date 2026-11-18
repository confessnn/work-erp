import { createClient } from "@supabase/supabase-js";
import { answerCallback, editMessageText, escapeTg, sendMessage } from "@/features/telegram/api";
import { addedReply, HELP_TEXT, parseQuickAdd, toQuickEvent, whenLabel } from "@/features/telegram/quick-add";
import { todayInSeoul } from "@/lib/format";

export const maxDuration = 60;

type Update = {
  message?: { message_id: number; chat: { id: number; type?: string }; text?: string };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number }; text?: string } };
};

/**
 * 텔레그램 봇 웹훅. 연동 화면에서 '일정 넣기'를 켜면 텔레그램이 이 주소로 메시지를 보낸다.
 * 헤더 X-Telegram-Bot-Api-Secret-Token 이 사람마다 다른 비밀값이고, DB가 그 해시로 누구인지 찾는다.
 * 연결된 대화방이 아닌 곳의 메시지는 무시한다. 오류가 나도 200을 돌려 텔레그램이 같은 메시지를 다시 보내지 않게 한다.
 */
export async function POST(request: Request) {
  const hook = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (hook.length < 32) return new Response("Unauthorized", { status: 401 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: links, error } = await db.rpc("tg_hook_link", { p_hook: hook });
  const link = (links ?? [])[0] as { chat_id: number | null; token: string | null } | undefined;
  if (error || !link?.token || !link.chat_id) return new Response("Unauthorized", { status: 401 });
  const token = link.token;
  const chatId = Number(link.chat_id);

  const update = (await request.json().catch(() => null)) as Update | null;
  try {
    const cb = update?.callback_query;
    if (cb) {
      if (cb.message?.chat.id !== chatId) return Response.json({ ok: true });
      const id = /^undo:([0-9a-f-]{36})$/.exec(cb.data ?? "")?.[1];
      if (!id) {
        await answerCallback(token, cb.id);
        return Response.json({ ok: true });
      }
      const { data: undone, error: e2 } = await db.rpc("tg_undo_event", { p_hook: hook, p_event: id });
      if (e2 || !undone) {
        await answerCallback(token, cb.id, "되돌릴 수 없어요 (하루가 지났거나 이미 지운 일정).");
        return Response.json({ ok: true });
      }
      await answerCallback(token, cb.id, "지웠어요.");
      await editMessageText(token, chatId, cb.message.message_id, `↩️ <s>${escapeTg(cb.message.text ?? "일정")}</s>\n되돌렸어요 (일정을 지웠어요).`);
      return Response.json({ ok: true });
    }

    const msg = update?.message;
    if (!msg || msg.chat.id !== chatId || !msg.text) return Response.json({ ok: true });
    const text = msg.text.trim();
    if (/^\/(start|help)\b/i.test(text) || text === "도움말") {
      await sendMessage(token, chatId, HELP_TEXT);
      return Response.json({ ok: true });
    }

    const today = todayInSeoul();
    const parsed = toQuickEvent(await parseQuickAdd(text, today), today);
    if (!parsed.ok) {
      await sendMessage(token, chatId, `🤔 ${escapeTg(parsed.reason)} 일정은 이렇게 보내 주세요.\n예) 내일 3시 치과\n\n(/help 로 사용법 보기)`);
      return Response.json({ ok: true });
    }
    const e = parsed.event;
    const { data: id, error: e3 } = await db.rpc("tg_add_event", {
      p_hook: hook,
      p_person: e.person,
      p_title: e.title,
      p_date: e.date,
      p_start: e.start,
      p_end: e.end,
      p_memo: e.memo,
    });
    if (e3 || !id) throw new Error(`저장하지 못했어요 (${whenLabel(e)} ${e.title})`);
    const reply = addedReply(e, id as string);
    await sendMessage(token, chatId, reply.html, reply.buttons);
  } catch (e) {
    await sendMessage(token, chatId, `⚠️ ${escapeTg(e instanceof Error ? e.message : "알 수 없는 오류")}`).catch(() => {});
  }
  return Response.json({ ok: true });
}
