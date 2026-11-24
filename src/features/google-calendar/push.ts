import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lecture } from "@/features/lectures/types";
import { readAllPages } from "@/lib/read-all";
import { decryptSecret } from "./crypto";
import { googleEventIdFor, googleTargetFromUid, importedEventPatch, instanceIdFor, lectureToGoogleEvent, seoulDateOf } from "./event";
import {
  accessToken,
  CALENDAR_SCOPE,
  calendarExists,
  hasScope,
  createErpCalendar,
  deleteCalendar,
  deleteEvent,
  getEvent,
  GoogleApiError,
  listInstances,
  isGoogleConfigured,
  patchEvent,
  upsertEvent,
} from "./google-api";

const EXPIRED = "구글 연결이 만료됐습니다. '연동' 화면에서 다시 연결해주세요.";

export type PushResult = { created: number; updated: number; deleted: number; error?: string };

/**
 * ERP → 구글 캘린더 맞추기 (멱등).
 * - 대상: ERP에서 직접 만든 강의만 (external_uid 없는 것). 구글에서 불러온 강의는 이미 구글에 있으므로 제외
 * - 새 강의 → 생성, 바뀐 강의(updated_at > google_synced_at) → 수정, 지운 강의 → 구글에서도 삭제
 * - 구글에서 불러온 강의를 ERP에서 고쳤으면(google_import_dirty) 구글 원본의 제목·날짜·시간을 고친다
 * - 실패해도 다음 실행 때 남은 것을 다시 처리한다
 *
 * supabase 는 로그인한 사용자의 클라이언트 (RLS 로 본인 데이터만 보임)
 */
export async function pushToGoogle(supabase: SupabaseClient, opts: { force?: boolean } = {}): Promise<PushResult | null> {
  if (!isGoogleConfigured()) return null;
  const { data: conn } = await supabase.from("google_connections").select("*").maybeSingle();
  if (!conn) return null;

  const result: PushResult = { created: 0, updated: 0, deleted: 0 };
  const save = async (extra: Record<string, unknown> = {}) => {
    const r = result.error
      ? `실패: ${result.error}`
      : `추가 ${result.created} · 수정 ${result.updated} · 삭제 ${result.deleted}`;
    await supabase
      .from("google_connections")
      .update({ last_push_at: new Date().toISOString(), last_push_result: r, ...extra })
      .eq("user_id", conn.user_id);
  };

  try {
    // 예전에 캘린더 권한 없이 연결했다면 건너뜀 (scopes 기록 전 연결은 캘린더 권한이 있었음)
    if (conn.scopes && !hasScope(conn.scopes, CALENDAR_SCOPE)) return null;
    let token: string;
    try {
      ({ token } = await accessToken(decryptSecret(conn.refresh_token_enc)));
    } catch (e) {
      // 토큰 요청이 거절됨(400 invalid_grant·401) = 사용자가 권한을 끊었거나 오래 안 써서 만료
      if (e instanceof GoogleApiError && (e.status === 400 || e.status === 401)) throw new Error(EXPIRED);
      throw e;
    }

    // 전용 캘린더 확인 (없거나 사용자가 구글에서 지웠으면 새로 만들고 전부 다시 올림)
    let calendarId: string | null = conn.calendar_id;
    let recreate = false;
    if (!calendarId || !(await calendarExists(token, calendarId))) {
      const old = calendarId;
      const fresh = await createErpCalendar(token);
      recreate = true;
      // 반영이 동시에 두 번 돌면(빠르게 두 번 누름) 둘 다 새 캘린더를 만든다 → 먼저 저장한 쪽 것만 쓰고 내 것은 지운다
      const claim = supabase.from("google_connections").update({ calendar_id: fresh }).eq("user_id", conn.user_id);
      const { data: won, error: claimError } = await (old ? claim.eq("calendar_id", old) : claim.is("calendar_id", null)).select("user_id");
      if (claimError) throw new Error(claimError.message);
      if (!won?.length) {
        await deleteCalendar(token, fresh).catch(() => {});
        const { data: now } = await supabase.from("google_connections").select("calendar_id").eq("user_id", conn.user_id).maybeSingle();
        if (!now?.calendar_id) throw new Error("ERP 캘린더를 정하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
        calendarId = now.calendar_id as string;
      } else {
        calendarId = fresh;
        await supabase.from("google_pending_deletes").delete().eq("user_id", conn.user_id);
        await supabase.from("google_import_deletes").delete().eq("user_id", conn.user_id);
        await supabase
          .from("lectures")
          .update({ google_event_id: null, google_synced_at: null })
          .not("google_event_id", "is", null);
      }
    }
    const calId = calendarId as string;

    // 1) ERP에서 지운 강의 → 구글에서 삭제
    if (!recreate) {
      const { data: dels } = await supabase.from("google_pending_deletes").select("google_event_id");
      for (const d of dels ?? []) {
        await deleteEvent(token, calId, d.google_event_id);
        await supabase.from("google_pending_deletes").delete().eq("google_event_id", d.google_event_id);
        result.deleted++;
      }
    }

    // 1-2) ERP에서 지운 '구글에서 불러온 강의' → 구글 원본 일정(반복이면 그 회차만) 삭제
    if (!recreate) {
      const { data: dels } = await supabase.from("google_import_deletes").select("external_uid");
      for (const d of dels ?? []) {
        if (await deleteImportedEvent(token, calId, d.external_uid)) result.deleted++;
        await supabase.from("google_import_deletes").delete().eq("external_uid", d.external_uid);
      }
    }

    // 1-3) ERP에서 고친 '구글에서 불러온 강의' → 구글 원본 일정(반복이면 그 회차만) 수정
    if (!recreate) {
      const { data: dirty } = await supabase
        .from("lectures")
        .select("id, external_uid, title, organization, lecture_date, start_time, end_time")
        .eq("google_import_dirty", true)
        .not("external_uid", "is", null);
      type Dirty = Pick<Lecture, "id" | "title" | "organization" | "lecture_date" | "start_time" | "end_time"> & { external_uid: string };
      for (const l of (dirty ?? []) as Dirty[]) {
        const id = await findImportedEventId(token, calId, l.external_uid);
        if (id && (await patchEvent(token, calId, id, importedEventPatch(l)))) result.updated++;
        // 구글에서 못 찾은 일정(다른 캘린더·이미 지워짐)은 더 시도하지 않는다
        await supabase.from("lectures").update({ google_import_dirty: false }).eq("id", l.id);
      }
    }

    // 2) 생성/수정 대상 (1000개가 넘어도 모두 읽는다 — Supabase API 는 한 번에 1000줄까지만 준다)
    const lectures = await readAllPages<Lecture & { google_event_id: string | null; google_synced_at: string | null }>((from, to) =>
      supabase.from("lectures").select("*").is("external_uid", null).order("lecture_date").order("id").range(from, to),
    );

    const skipped: string[] = [];
    for (const l of lectures) {
      const changed = !l.google_synced_at || new Date(l.updated_at) > new Date(l.google_synced_at);
      if (l.google_event_id && !changed && !opts.force) continue;

      const ev = lectureToGoogleEvent(l, conn.show_amounts);
      const eventId = googleEventIdFor(l.id);
      let r;
      try {
        r = await upsertEvent(token, calId, eventId, ev);
      } catch (e) {
        // 이 일정만 구글이 받지 않음(입력값 문제) → 건너뛰고 나머지는 계속 올린다
        if (e instanceof GoogleApiError && e.status === 400) {
          skipped.push(`${l.lecture_date} ${l.title}: ${e.message}`);
          continue;
        }
        throw e;
      }
      if (r === "created") result.created++;
      else result.updated++;
      await supabase
        .from("lectures")
        .update({ google_event_id: eventId, google_synced_at: new Date().toISOString() })
        .eq("id", l.id);
    }
    if (skipped.length) result.error = `구글이 받지 않은 일정 ${skipped.length}건 — ${skipped.slice(0, 3).join(" / ")}`;
  } catch (e) {
    result.error = e instanceof GoogleApiError && e.status === 401 ? EXPIRED : e instanceof Error ? e.message : "알 수 없는 오류";
  }

  await save();
  return result;
}

const addDaysIso = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};

/**
 * 구글에서 불러온 강의의 원본 일정을 ERP 전용 캘린더에서 지운다. 지웠으면 true.
 * 권한(calendar.app.created)상 ERP 전용 캘린더의 일정만 지울 수 있다. 다른 캘린더에서 불러온 일정은 404 → 건너뜀.
 */
async function deleteImportedEvent(token: string, calendarId: string, externalUid: string): Promise<boolean> {
  const id = await findImportedEventId(token, calendarId, externalUid);
  return id ? deleteEvent(token, calendarId, id) : false;
}

/**
 * 구글에서 불러온 강의(external_uid)의 원본 일정 ID. 못 찾으면 null.
 * - 단일 일정: 일정 ID 그대로
 * - 반복 일정 회차: 회차 ID(일정ID_원래시작)를 계산하고, 안 맞으면 그 날짜 앞뒤 회차 목록에서 원래 날짜로 찾는다
 */
async function findImportedEventId(token: string, calendarId: string, externalUid: string): Promise<string | null> {
  const t = googleTargetFromUid(externalUid);
  if (!t) return null;
  if (!t.date) return t.eventId;

  const master = await getEvent(token, calendarId, t.eventId);
  if (!master || master.status === "cancelled" || !master.recurrence?.length) return null;

  const guess = instanceIdFor(t.eventId, master.start, t.date);
  if (guess) {
    const inst = await getEvent(token, calendarId, guess);
    if (inst && inst.status !== "cancelled" && seoulDateOf(inst.originalStartTime ?? inst.start) === t.date) return guess;
  }
  // 회차를 다른 날로 옮긴 경우 등: 앞뒤 7일 회차 중 원래 날짜가 같은 것
  const items = await listInstances(
    token,
    calendarId,
    t.eventId,
    `${addDaysIso(t.date, -7)}T00:00:00+09:00`,
    `${addDaysIso(t.date, 8)}T00:00:00+09:00`,
  );
  const hit = items.find((x) => x.status !== "cancelled" && seoulDateOf(x.originalStartTime ?? x.start) === t.date);
  return hit?.id ?? null;
}

/**
 * 강의를 저장/수정/삭제한 뒤 호출: 응답을 보낸 다음(after) 구글 캘린더에 반영한다.
 * 구글 연결이 없으면 아무것도 안 함. 실패해도 저장은 이미 끝났고, 다음 반영 때 다시 시도된다.
 */
export function schedulePush(supabase: SupabaseClient) {
  after(async () => {
    await pushToGoogle(supabase);
  });
}

/**
 * 구글에서 지울 일정이 남아 있으면 반영 예약 (예: 매일 자동 불러오기가 ERP 일정을 구글 원본과 연결한 경우).
 * 남은 게 없으면 구글을 부르지 않는다.
 */
export async function flushPendingGoogleDeletes(supabase: SupabaseClient) {
  if (!isGoogleConfigured()) return;
  const [{ count }, { count: dirty }] = await Promise.all([
    supabase.from("google_pending_deletes").select("*", { count: "exact", head: true }),
    supabase.from("lectures").select("id", { count: "exact", head: true }).eq("google_import_dirty", true),
  ]);
  if (count || dirty) schedulePush(supabase);
}
