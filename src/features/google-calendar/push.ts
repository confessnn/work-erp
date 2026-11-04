import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lecture } from "@/features/lectures/types";
import { decryptSecret } from "./crypto";
import { googleEventIdFor, lectureToGoogleEvent } from "./event";
import {
  accessToken,
  calendarExists,
  createErpCalendar,
  deleteEvent,
  GoogleApiError,
  isGoogleConfigured,
  upsertEvent,
} from "./google-api";

export type PushResult = { created: number; updated: number; deleted: number; error?: string };

/**
 * ERP → 구글 캘린더 맞추기 (멱등).
 * - 대상: ERP에서 직접 만든 강의만 (external_uid 없는 것). 구글에서 불러온 강의는 이미 구글에 있으므로 제외
 * - 새 강의 → 생성, 바뀐 강의(updated_at > google_synced_at) → 수정, 지운 강의 → 구글에서도 삭제
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
    const token = await accessToken(decryptSecret(conn.refresh_token_enc));

    // 전용 캘린더 확인 (없거나 사용자가 구글에서 지웠으면 새로 만들고 전부 다시 올림)
    let calendarId: string | null = conn.calendar_id;
    let recreate = false;
    if (!calendarId || !(await calendarExists(token, calendarId))) {
      calendarId = await createErpCalendar(token);
      recreate = true;
      await supabase.from("google_connections").update({ calendar_id: calendarId }).eq("user_id", conn.user_id);
      await supabase.from("google_pending_deletes").delete().eq("user_id", conn.user_id);
      await supabase
        .from("lectures")
        .update({ google_event_id: null, google_synced_at: null })
        .not("google_event_id", "is", null);
    }

    // 1) ERP에서 지운 강의 → 구글에서 삭제
    if (!recreate) {
      const { data: dels } = await supabase.from("google_pending_deletes").select("google_event_id");
      for (const d of dels ?? []) {
        await deleteEvent(token, calendarId, d.google_event_id);
        await supabase.from("google_pending_deletes").delete().eq("google_event_id", d.google_event_id);
        result.deleted++;
      }
    }

    // 2) 생성/수정 대상
    const { data: rows } = await supabase
      .from("lectures")
      .select("*")
      .is("external_uid", null)
      .order("lecture_date");
    const lectures = (rows ?? []) as (Lecture & { google_event_id: string | null; google_synced_at: string | null })[];

    for (const l of lectures) {
      const changed = !l.google_synced_at || new Date(l.updated_at) > new Date(l.google_synced_at);
      if (l.google_event_id && !changed && !opts.force) continue;

      const ev = lectureToGoogleEvent(l, conn.show_amounts);
      const eventId = googleEventIdFor(l.id);
      const r = await upsertEvent(token, calendarId, eventId, ev);
      if (r === "created") result.created++;
      else result.updated++;
      await supabase
        .from("lectures")
        .update({ google_event_id: eventId, google_synced_at: new Date().toISOString() })
        .eq("id", l.id);
    }
  } catch (e) {
    result.error =
      e instanceof GoogleApiError && (e.status === 400 || e.status === 401)
        ? "구글 연결이 만료됐습니다. '연동' 화면에서 다시 연결해주세요."
        : e instanceof Error
          ? e.message
          : "알 수 없는 오류";
  }

  await save();
  return result;
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
  const { count } = await supabase.from("google_pending_deletes").select("*", { count: "exact", head: true });
  if (count) schedulePush(supabase);
}
