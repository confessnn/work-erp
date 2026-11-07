/** 알림을 켤 수 있는 일정의 종류 (event_reminders.kind) */
export type ReminderKind = "lecture" | "event" | "import";

export type ReminderTarget = { kind: ReminderKind; ref: string; date: string };

/** 화면에서 '알림 켜짐' 여부를 찾는 키 */
export const reminderKey = (kind: ReminderKind, ref: string) => `${kind}|${ref}`;

/** 가족 일정의 알림 대상. 구글에서 가져온 일정은 다시 가져오면 id 가 바뀌므로 원본 id 로 기억한다. */
export function familyEventTarget(e: {
  id: string;
  event_date: string;
  source_id: string | null;
  external_uid: string | null;
}): ReminderTarget {
  return e.source_id && e.external_uid
    ? { kind: "import", ref: `${e.source_id}:${e.external_uid}`, date: e.event_date }
    : { kind: "event", ref: e.id, date: e.event_date };
}

/** 서버로 받은 값 검사 */
export function parseTarget(v: unknown): ReminderTarget | null {
  if (!v || typeof v !== "object") return null;
  const { kind, ref, date } = v as Record<string, unknown>;
  if (kind !== "lecture" && kind !== "event" && kind !== "import") return null;
  if (typeof ref !== "string" || ref.length === 0 || ref.length > 600) return null;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { kind, ref, date };
}

/** 브라우저 구독 정보 검사 (PushSubscription.toJSON()) */
export function parseSubscription(v: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  if (!v || typeof v !== "object") return null;
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof s.endpoint !== "string" || !s.endpoint.startsWith("https://") || s.endpoint.length > 1000) return null;
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint: s.endpoint, p256dh, auth };
}
