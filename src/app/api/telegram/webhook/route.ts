import { createClient } from "@supabase/supabase-js";
import { answerCallback, editMessageText, escapeTg, sendMessage } from "@/features/telegram/api";
import { overlapLabel, type Overlap } from "@/features/family/overlap";
import {
  addedReply,
  HELP_TEXT,
  memoReply,
  overlapReply,
  parseCallback,
  parseQuickAdd,
  pickMemoTarget,
  toQuickEvent,
  whenLabel,
  type Existing,
  type QuickEvent,
} from "@/features/telegram/quick-add";
import { addDays } from "@/features/todos/todos";
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
      const act = parseCallback(cb.data);
      if (!act) {
        await answerCallback(token, cb.id);
        return Response.json({ ok: true });
      }
      if (act.kind === "undo") {
        const { data: undone, error: e2 } = await db.rpc("tg_undo_event", { p_hook: hook, p_event: act.id });
        if (e2 || !undone) {
          await answerCallback(token, cb.id, "되돌릴 수 없어요 (하루가 지났거나 이미 지운 일정).");
          return Response.json({ ok: true });
        }
        await answerCallback(token, cb.id, "지웠어요.");
        await editMessageText(token, chatId, cb.message.message_id, `↩️ <s>${escapeTg(cb.message.text ?? "일정")}</s>\n되돌렸어요 (일정을 지웠어요).`);
        return Response.json({ ok: true });
      }
      // 시간이 겹쳐서 물어본 일정: [그래도 넣기] / [넣지 않기]
      const { data: held, error: e4 } = await db.rpc("tg_release_event", { p_hook: hook, p_pending: act.id, p_add: act.kind === "add" });
      const ev = held as (QuickEvent & { id: string | null }) | null;
      if (e4 || !ev) {
        await answerCallback(token, cb.id, "이미 처리했거나 하루가 지난 일정이에요.");
        await editMessageText(token, chatId, cb.message.message_id, escapeTg(cb.message.text ?? "일정")).catch(() => {});
        return Response.json({ ok: true });
      }
      if (act.kind === "skip" || !ev.id) {
        await answerCallback(token, cb.id, "넣지 않았어요.");
        await editMessageText(token, chatId, cb.message.message_id, `🚫 넣지 않았어요: ${whenLabel(ev)} ${escapeTg(ev.title)}`);
        return Response.json({ ok: true });
      }
      await answerCallback(token, cb.id, "넣었어요.");
      const reply = addedReply(ev, ev.id);
      await editMessageText(token, chatId, cb.message.message_id, reply.html, reply.buttons);
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
    // 어제~두 달 뒤 일정을 AI에게 보여 주고, 그중 하나에 붙이는 메모면 새 일정 대신 메모로 붙인다
    const { data: up } = await db.rpc("tg_upcoming", { p_hook: hook, p_from: addDays(today, -1), p_to: addDays(today, 60) });
    const existing = (up ?? []) as Existing[];
    const raw = await parseQuickAdd(text, today, existing);
    const memoTo = pickMemoTarget(raw, existing);
    if (memoTo) {
      const { data: m, error: e6 } = await db.rpc("tg_add_memo", { p_hook: hook, p_kind: memoTo.target.kind, p_id: memoTo.target.id, p_memo: memoTo.memo });
      if (e6 || !m) throw new Error(`메모를 붙이지 못했어요 (${memoTo.target.title})`);
      const reply = memoReply(m as Parameters<typeof memoReply>[0], memoTo.memo);
      await sendMessage(token, chatId, reply.html, reply.buttons);
      return Response.json({ ok: true });
    }
    const parsed = toQuickEvent(raw, today);
    if (!parsed.ok) {
      await sendMessage(token, chatId, `🤔 ${escapeTg(parsed.reason)} 일정은 이렇게 보내 주세요.\n예) 내일 3시 치과\n\n(/help 로 사용법 보기)`);
      return Response.json({ ok: true });
    }
    const e = parsed.event;
    // 시간이 겹치는 일정이 있으면 바로 넣지 않고 물어본다
    const { data: ov } = await db.rpc("tg_overlaps", { p_hook: hook, p_date: e.date, p_start: e.start, p_end: e.end });
    const overlaps = (ov ?? []) as Overlap[];
    if (overlaps.length) {
      const { data: pendingId, error: e5 } = await db.rpc("tg_hold_event", {
        p_hook: hook,
        p_person: e.person,
        p_title: e.title,
        p_date: e.date,
        p_start: e.start,
        p_end: e.end,
        p_memo: e.memo,
      });
      if (e5 || !pendingId) throw new Error(`저장하지 못했어요 (${whenLabel(e)} ${e.title})`);
      const ask = overlapReply(e, pendingId as string, overlaps.map(overlapLabel));
      await sendMessage(token, chatId, ask.html, ask.buttons);
      return Response.json({ ok: true });
    }
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
