import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { sendTelegram, webhookSecret } from "@/features/telegram/api";
import { ERP_URL } from "@/features/telegram/format";

type Update = {
  message?: { chat: { id: number; type: string; first_name?: string; username?: string }; text?: string };
  my_chat_member?: { chat: { id: number }; new_chat_member: { status: string } };
};

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * 텔레그램 봇 웹훅. 텔레그램이 보낸 요청인지 비밀 헤더로 확인한다.
 * /start <코드>: ERP 연동 화면에서 받은 1회용 코드로 이 대화방을 계정에 묶는다.
 * /stop 이나 봇 차단: 연결을 지운다.
 * DB 쓰기는 비밀값으로 잠긴 함수(cron_telegram_*)로만. 항상 200을 돌려줘야 텔레그램이 같은 요청을 반복하지 않는다.
 */
export async function POST(request: Request) {
  const expected = webhookSecret();
  const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !sameSecret(got, expected)) return new Response("Unauthorized", { status: 401 });

  const cron = process.env.CRON_SECRET;
  if (!cron) return Response.json({ ok: false });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const update = (await request.json().catch(() => ({}))) as Update;

  // 봇을 차단(kicked)하면 연결 해제
  const member = update.my_chat_member;
  if (member && ["kicked", "left"].includes(member.new_chat_member.status)) {
    await db.rpc("cron_telegram_unlink", { p_secret: cron, p_chat_id: member.chat.id });
    return Response.json({ ok: true });
  }

  const msg = update.message;
  if (!msg?.text) return Response.json({ ok: true });
  const chatId = msg.chat.id;
  if (msg.chat.type !== "private") {
    await sendTelegram(chatId, "개인 대화에서만 쓸 수 있어요.");
    return Response.json({ ok: true });
  }

  const [cmd, arg] = msg.text.trim().split(/\s+/, 2);
  if (cmd === "/start" && arg && /^[A-Za-z0-9]{24,64}$/.test(arg)) {
    const name = msg.chat.username ? `@${msg.chat.username}` : (msg.chat.first_name ?? "");
    const { data, error } = await db.rpc("cron_telegram_link", { p_secret: cron, p_code: arg, p_chat_id: chatId, p_name: name });
    const fail = error ? "지금은 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요." : typeof data === "string" && data ? data : null;
    await sendTelegram(
      chatId,
      fail ?? "✅ ERP와 연결했어요.\n매일 아침 <b>오늘 할 일·새 공고</b>와 <b>일정 1시간 전 알림</b>을 여기로 보내 드릴게요.\n설정은 ERP의 연동 화면에서 바꿀 수 있어요.",
    );
  } else if (cmd === "/stop") {
    await db.rpc("cron_telegram_unlink", { p_secret: cron, p_chat_id: chatId });
    await sendTelegram(chatId, "연결을 끊었어요. 더 이상 알림을 보내지 않아요.");
  } else {
    await sendTelegram(chatId, `ERP 알림 봇이에요. 연결은 <a href="${ERP_URL}/integrations">ERP 연동 화면</a>의 '텔레그램 연결' 버튼으로 해 주세요.`);
  }
  return Response.json({ ok: true });
}
