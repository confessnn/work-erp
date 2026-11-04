import "server-only";
import type { GoogleEvent } from "./event";

/**
 * 구글 OAuth / Calendar API 최소 클라이언트 (fetch 만 사용).
 * 권한: calendar.app.created = "이 앱이 만든 캘린더"만 읽고 쓸 수 있음 (기존 개인 캘린더는 건드리지 못함)
 */
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.app.created"];
export const ERP_CALENDAR_NAME = "강의 일정(ERP)";

const API = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("구글 연동 설정(GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)이 없습니다.");
  return { id, secret };
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_KEY);
}

export function authUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: clientCreds().id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // refresh token 을 매번 확실히 받기 위해
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const { id, secret } = clientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) throw new GoogleApiError(res.status, json.error_description || json.error || "토큰 요청 실패");
  return json;
}

/** 인증 코드 → refresh token + 이메일 */
export async function exchangeCode(code: string, redirectUri: string) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!t.refresh_token) throw new Error("구글이 refresh token 을 주지 않았습니다. 다시 연결해주세요.");
  let email: string | null = null;
  try {
    const payload = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString("utf8"));
    email = typeof payload.email === "string" ? payload.email : null;
  } catch {
    /* 이메일은 표시용이라 없어도 됨 */
  }
  const granted = (t.scope ?? "").split(" ");
  if (!granted.includes(GOOGLE_SCOPES[2])) {
    throw new Error("캘린더 권한이 허용되지 않았습니다. 연결 화면에서 캘린더 권한에 체크해주세요.");
  }
  return { refreshToken: t.refresh_token, email };
}

export async function accessToken(refreshToken: string) {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return t.access_token;
}

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleApiError(res.status, json?.error?.message ?? `구글 API 오류 ${res.status}`);
  return json as T;
}

export async function createErpCalendar(token: string): Promise<string> {
  const cal = await call<{ id: string }>(token, "POST", "/calendars", {
    summary: ERP_CALENDAR_NAME,
    description: "work-erp에서 자동으로 관리하는 강의 일정입니다.",
    timeZone: "Asia/Seoul",
  });
  return cal.id;
}

/** 캘린더가 아직 있는지 (사용자가 구글에서 지웠을 수 있음) */
export async function calendarExists(token: string, calendarId: string) {
  try {
    await call(token, "GET", `/calendars/${encodeURIComponent(calendarId)}`);
    return true;
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return false;
    throw e;
  }
}

/** 고정 ID로 생성. 이미 있으면(409) 수정으로 처리 → 동시에 두 번 실행돼도 일정은 하나 */
export async function upsertEvent(token: string, calendarId: string, eventId: string, ev: GoogleEvent) {
  try {
    await call(token, "POST", `/calendars/${encodeURIComponent(calendarId)}/events`, { ...ev, id: eventId });
    return "created" as const;
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 409) {
      await updateEvent(token, calendarId, eventId, ev);
      return "updated" as const;
    }
    throw e;
  }
}

export async function updateEvent(token: string, calendarId: string, eventId: string, ev: GoogleEvent) {
  await call(token, "PUT", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, ev);
}

export async function deleteEvent(token: string, calendarId: string, eventId: string) {
  try {
    await call(token, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  } catch (e) {
    // 이미 지워진 일정이면 성공으로 본다
    if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}
