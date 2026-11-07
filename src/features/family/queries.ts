import "server-only";
import { cache } from "react";
import { requireUser } from "@/lib/supabase/server";
import { monthRange } from "./form";
import type { FamilyEvent, FamilyLecture, FamilyRole } from "./types";

/** 로그인한 사람이 가족 구성원(초대받은 사람)인지, 가족을 만든 사람인지 */
export const getFamilyRole = cache(async (): Promise<FamilyRole> => {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("family_members")
    .select("owner_id, label")
    .eq("member_id", userId)
    .maybeSingle();
  return data
    ? { role: "member", userId, ownerId: data.owner_id as string, label: data.label as string }
    : { role: "owner", userId };
});

export async function listFamilyMonth(year: number, month: number) {
  const { supabase } = await requireUser();
  const { start, next } = monthRange(year, month);
  const [ev, lec] = await Promise.all([
    supabase
      .from("family_events")
      .select("id, family_id, person, title, event_date, start_time, end_time, memo, created_by, updated_at, source_id, external_uid")
      .gte("event_date", start)
      .lt("event_date", next)
      .order("event_date")
      .order("start_time", { nullsFirst: true }),
    supabase.rpc("family_lecture_schedule", { p_from: start, p_to: next }),
  ]);
  if (ev.error) throw new Error(ev.error.message);
  if (lec.error) throw new Error(lec.error.message);
  return { events: (ev.data ?? []) as FamilyEvent[], lectures: (lec.data ?? []) as FamilyLecture[] };
}

export async function getFamilyEvent(id: string): Promise<FamilyEvent | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("family_events")
    .select("id, family_id, person, title, event_date, start_time, end_time, memo, created_by, updated_at, source_id, external_uid")
    .eq("id", id)
    .maybeSingle();
  return (data as FamilyEvent | null) ?? null;
}

export type FamilyInvite = { token: string; label: string; expires_at: string; used_at: string | null };
export type FamilyMember = { member_id: string; label: string; created_at: string };

/** 가족 관리 화면용 (가족을 만든 사람만) */
export async function listFamilyAdmin() {
  const { supabase, userId } = await requireUser();
  const [inv, mem] = await Promise.all([
    // 아직 쓸 수 있는 초대 링크만
    supabase
      .from("family_invites")
      .select("token, label, expires_at, used_at")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("family_members").select("member_id, label, created_at").eq("owner_id", userId).order("created_at"),
  ]);
  return { invites: (inv.data ?? []) as FamilyInvite[], members: (mem.data ?? []) as FamilyMember[] };
}

export type FamilySource = {
  id: string;
  person: string;
  name: string;
  last_synced_at: string | null;
  last_result: string | null;
};

/** 내가 연결한 구글 캘린더 (iCal 주소는 화면에 다시 보여 주지 않는다) */
export async function listMyFamilySources(): Promise<FamilySource[]> {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("family_calendar_sources")
    .select("id, person, name, last_synced_at, last_result")
    .eq("created_by", userId)
    .order("created_at");
  return (data ?? []) as FamilySource[];
}
