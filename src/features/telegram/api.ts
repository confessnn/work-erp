// 텔레그램 봇 API (https://core.telegram.org/bots/api). 토큰은 주소에 들어가므로 오류 문구에 주소를 넣지 않는다.

/** 한 메시지 최대 4096자. 여유를 둔다 */
export const MAX_MESSAGE = 3800;

export type InlineButton = { text: string; url: string } | { text: string; callback_data: string };
type Update = { message?: { chat?: { id?: number; type?: string }; text?: string } };

async function call<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("텔레그램 서버에 연결하지 못했습니다.");
  }
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!data?.ok) {
    if (res.status === 401) throw new Error("봇 토큰이 맞지 않습니다. BotFather의 토큰을 다시 넣어 주세요.");
    if (res.status === 403) throw new Error("봇이 대화를 보낼 수 없습니다. 텔레그램에서 봇을 차단했는지 확인하고 봇에게 /start를 보내 주세요.");
    throw new Error(`텔레그램 오류: ${data?.description ?? `HTTP ${res.status}`}`);
  }
  return data.result as T;
}

/** HTML 서식(굵게·링크)으로 보낸다. 버튼은 마지막 줄에 붙는다 */
export async function sendMessage(token: string, chatId: number, html: string, buttons: InlineButton[] = []) {
  await call(token, "sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  });
}

/** 여러 조각을 차례로 보낸다. 버튼은 마지막 조각에만 단다 */
export async function sendChunks(token: string, chatId: number, chunks: string[], buttons: InlineButton[] = []) {
  for (let i = 0; i < chunks.length; i++) {
    await sendMessage(token, chatId, chunks[i], i === chunks.length - 1 ? buttons : []);
  }
}

export const getUpdates = (token: string) => call<Update[]>(token, "getUpdates", { allowed_updates: ["message"], limit: 100 });

/** 봇에게 연결 코드를 보낸 1:1 대화방을 찾는다 (가장 최근 것) */
export function findChatByCode(updates: Update[], code: string): number | null {
  for (let i = updates.length - 1; i >= 0; i--) {
    const m = updates[i].message;
    if (m?.chat?.type === "private" && typeof m.chat.id === "number" && (m.text ?? "").toUpperCase().includes(code)) return m.chat.id;
  }
  return null;
}

/** 텔레그램 HTML에서 특별한 글자 */
export const escapeTg = (text: string) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

/** 블록(빈 줄로 이을 덩어리)들을 한 메시지 길이에 맞춰 묶는다. 한 블록이 너무 길면 자른다 */
export function packChunks(blocks: string[], max = MAX_MESSAGE): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const raw of blocks) {
    const block = raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
    if (cur && cur.length + 2 + block.length > max) {
      chunks.push(cur);
      cur = block;
    } else {
      cur = cur ? `${cur}\n\n${block}` : block;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** 토큰이 맞는지 확인하고 봇 아이디(@없이)를 돌려준다 */
/** 이미 보낸 메시지 글자 바꾸기. buttons 를 주지 않으면 버튼은 없앤다 */
export const editMessageText = (token: string, chatId: number, messageId: number, html: string, buttons: InlineButton[] = []) =>
  call(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
  });

/** 버튼 누름에 답하기 (버튼의 '불러오는 중' 표시를 끈다) */
export const answerCallback = (token: string, id: string, text?: string) => call(token, "answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });

/** 봇에게 온 메시지를 우리 주소로 보내 달라고 등록한다. 등록 중에는 getUpdates를 쓸 수 없다 */
export const setWebhook = (token: string, url: string, secret: string) =>
  call(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });

export const deleteWebhook = (token: string) => call(token, "deleteWebhook", { drop_pending_updates: false });

export async function getBotUsername(token: string) {
  const me = await call<{ username?: string }>(token, "getMe", {});
  if (!me.username) throw new Error("봇 정보를 읽지 못했습니다.");
  return me.username;
}
