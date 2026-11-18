import "server-only";
import { createHash } from "node:crypto";

/** 봇 토큰 (Vercel 환경변수 TELEGRAM_BOT_TOKEN). 없으면 텔레그램 기능은 조용히 꺼진다 */
export const botToken = () => process.env.TELEGRAM_BOT_TOKEN || null;
export const BOT_USERNAME = "work_erp_bot";

/**
 * 웹훅 확인용 비밀값. 따로 환경변수를 두지 않고 봇 토큰에서 만든다
 * (토큰을 바꾸면 이 값도 바뀌고, 다음 연결 때 웹훅이 새 값으로 다시 등록된다).
 */
export function webhookSecret(token = botToken()) {
  if (!token) return null;
  return createHash("sha256").update(`work-erp-webhook:${token}`).digest("hex");
}

type TgResult<T> = { ok: true; result: T } | { ok: false; error_code: number; description: string };

async function call<T>(method: string, body: Record<string, unknown>): Promise<TgResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, error_code: 0, description: "TELEGRAM_BOT_TOKEN 이 설정되지 않았습니다." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return (await res.json()) as TgResult<T>;
  } catch (e) {
    return { ok: false, error_code: 0, description: e instanceof Error ? e.message : "네트워크 오류" };
  }
}

/**
 * 메시지 보내기. gone=true 면 사용자가 봇을 차단했거나 대화방이 없어진 것 → 연결을 지워야 한다.
 */
export async function sendTelegram(chatId: number | string, html: string): Promise<{ ok: boolean; gone: boolean; error?: string }> {
  const r = await call("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  if (r.ok) return { ok: true, gone: false };
  const gone = r.error_code === 403 || (r.error_code === 400 && /chat not found/i.test(r.description));
  return { ok: false, gone, error: `텔레그램 ${r.error_code}: ${r.description}` };
}

/** 웹훅 등록 (같은 값이면 텔레그램이 그대로 둔다) */
export async function ensureWebhook(origin: string) {
  const secret = webhookSecret();
  if (!secret) return { ok: false, error: "봇 토큰이 없습니다." };
  const r = await call("setWebhook", {
    url: `${origin}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "my_chat_member"],
  });
  return r.ok ? { ok: true } : { ok: false, error: r.description };
}
