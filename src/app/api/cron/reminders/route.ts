import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { sendMessage } from "@/features/telegram/api";
import { reminderTelegram } from "@/features/telegram/reminder";

export const maxDuration = 60;

type Due = { reminder_id: string; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string };

/**
 * 5분마다 Supabase pg_cron(pg_net)이 호출한다 (supabase/migrations/20261108030000_reminder_schedule.sql).
 * Authorization: Bearer <Vault 'reminder_secret'>. 비밀값 확인은 DB 함수가 한다(여기서는 그대로 넘김).
 * 웹 푸시 서명 키(VAPID)는 처음 실행 때 만들어 Vault 에 저장한다.
 */
async function handle(request: Request) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (secret.length < 32) return new Response("Unauthorized", { status: 401 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: keys, error: e0 } = await db.rpc("cron_vapid", { p_secret: secret }).maybeSingle<{ public_key: string | null; private_key: string | null }>();
  if (e0) return new Response("Unauthorized", { status: 401 });

  let pub = keys?.public_key ?? null;
  let priv = keys?.private_key ?? null;
  if (!pub || !priv) {
    const fresh = webpush.generateVAPIDKeys();
    const { error } = await db.rpc("cron_set_vapid", { p_secret: secret, p_public: fresh.publicKey, p_private: fresh.privateKey });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    const { data: again } = await db.rpc("cron_vapid", { p_secret: secret }).maybeSingle<{ public_key: string; private_key: string }>();
    pub = again?.public_key ?? null;
    priv = again?.private_key ?? null;
    if (!pub || !priv) return Response.json({ ok: false, error: "VAPID 키를 저장하지 못했습니다." }, { status: 500 });
  }
  webpush.setVapidDetails(new URL(request.url).origin, pub, priv);

  const { data: due, error: e1 } = await db.rpc("cron_due_reminders", { p_secret: secret });
  if (e1) return Response.json({ ok: false, error: e1.message }, { status: 500 });

  const sent = new Set<string>();
  const gone: string[] = [];
  const failed: string[] = [];
  await Promise.all(
    ((due ?? []) as Due[]).map(async (d) => {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          JSON.stringify({ title: d.title, body: d.body, url: d.url, tag: d.reminder_id }),
          { TTL: 60 * 60, urgency: "high" },
        );
        sent.add(d.reminder_id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: 휴대폰에서 알림을 끄거나 앱을 지운 구독 → 지운다
        if (status === 404 || status === 410) gone.push(d.endpoint);
        else failed.push(String(status ?? "network"));
        // 이 휴대폰만 실패해도 같은 사람의 다른 휴대폰으로 갔을 수 있으므로, 구독이 없어진 경우만 보낸 것으로 친다
        if (status === 404 || status === 410) sent.add(d.reminder_id);
      }
    }),
  );

  const { error: e2 } = await db.rpc("cron_finish_reminders", { p_secret: secret, p_sent: [...sent], p_gone: gone });
  if (e2) return Response.json({ ok: false, error: e2.message }, { status: 500 });

  const telegram = await sendTelegramReminders(db, secret);
  return Response.json({ ok: true, due: (due ?? []).length, sent: sent.size, gone: gone.length, failed, telegram });
}

type TgDue = { user_id: string; token: string | null; chat_id: number; item_key: string; title: string; body: string; url: string };

/**
 * 텔레그램 일정 알림 (봇을 연결한 사람만). 웹 푸시와 따로 기록해서 푸시를 안 쓰는 사람도 받는다.
 * 실패해도 웹 푸시 결과에는 영향을 주지 않고, 실패 이유는 연동 화면에 보인다.
 */
async function sendTelegramReminders(db: SupabaseClient, secret: string) {
  const { data, error } = await db.rpc("cron_due_telegram", { p_secret: secret });
  if (error) return `조회 실패: ${error.message}`;
  const due = (data ?? []) as TgDue[];
  if (!due.length) return "보낼 것 없음";

  const sent: { user_id: string; item_key: string }[] = [];
  const errors = new Map<string, string>();
  for (const d of due) {
    if (!d.token || errors.has(d.user_id)) continue;
    const m = reminderTelegram(d.title, d.body, d.url);
    try {
      await sendMessage(d.token, d.chat_id, m.html, m.buttons);
      sent.push({ user_id: d.user_id, item_key: d.item_key });
    } catch (e) {
      errors.set(d.user_id, `일정 알림: ${e instanceof Error ? e.message : "보내지 못했습니다."}`);
    }
  }
  const { error: e2 } = await db.rpc("cron_finish_telegram", {
    p_secret: secret,
    p_sent: sent,
    p_errors: [...errors].map(([user_id, error]) => ({ user_id, error })),
  });
  return e2 ? `기록 실패: ${e2.message}` : `${sent.length}/${due.length}건 발송`;
}

export const GET = handle;
export const POST = handle;
