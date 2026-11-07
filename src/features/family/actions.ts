"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { normalizeIcsUrl } from "@/features/calendar-import/ics";
import { todayInSeoul } from "@/lib/format";
import { parseEventInput } from "./form";
import { fetchImportRows } from "./import";
import { getFamilyRole } from "./queries";

export type FamilyFormState = { error?: string };

/** 가족 일정 추가(id 없음) / 수정 */
export async function saveFamilyEvent(id: string | null, _prev: FamilyFormState, fd: FormData): Promise<FamilyFormState> {
  const parsed = parseEventInput((k) => fd.get(k));
  if (!parsed.ok) return { error: parsed.error };
  const { supabase } = await requireUser();
  const { error } = id
    ? await supabase
        .from("family_events")
        .update({ ...parsed.value, updated_at: new Date().toISOString() })
        .eq("id", id)
    : await supabase.from("family_events").insert(parsed.value);
  if (error) return { error: `저장하지 못했어요: ${error.message}` };
  revalidatePath("/family");
  const [y, m] = parsed.value.event_date.split("-");
  redirect(`/family?y=${Number(y)}&m=${Number(m)}`);
}

export async function deleteFamilyEvent(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("family_events").delete().eq("id", id);
  revalidatePath("/family");
  redirect("/family");
}

/** 초대 링크 만들기 (가족을 만든 사람만) */
export async function createFamilyInvite(_prev: FamilyFormState, fd: FormData): Promise<FamilyFormState> {
  const role = await getFamilyRole();
  if (role.role !== "owner") return { error: "가족을 만든 사람만 초대할 수 있어요." };
  const label = String(fd.get("label") ?? "").trim().slice(0, 30) || "가족";
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("family_invites")
    .insert({ token: randomBytes(24).toString("hex"), label });
  if (error) return { error: `초대 링크를 만들지 못했어요: ${error.message}` };
  revalidatePath("/family/settings");
  return {};
}

export async function deleteFamilyInvite(token: string) {
  const { supabase } = await requireUser();
  await supabase.from("family_invites").delete().eq("token", token);
  revalidatePath("/family/settings");
}

/** 가족에서 내보내기 (가족을 만든 사람) */
export async function removeFamilyMember(memberId: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("family_members").delete().eq("member_id", memberId).eq("owner_id", userId);
  revalidatePath("/family/settings");
}

/** 초대 수락 */
export async function acceptFamilyInvite(token: string): Promise<FamilyFormState> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_family_invite", { p_token: token });
  if (error) return { error: `참여하지 못했어요: ${error.message}` };
  if (typeof data === "string" && data) return { error: data };
  revalidatePath("/", "layout");
  redirect("/family");
}

/** 내 구글 캘린더 연결 (비공개 iCal 주소). 연결하자마자 한 번 가져온다. */
export async function addFamilySource(_prev: FamilyFormState, fd: FormData): Promise<FamilyFormState> {
  const person = String(fd.get("person") ?? "");
  if (!["dad", "mom", "baby", "all"].includes(person)) return { error: "누구의 캘린더인지 골라 주세요." };
  const url = normalizeIcsUrl(String(fd.get("ics_url") ?? ""));
  if (!url) return { error: "https:// 로 시작하는 iCal 주소를 붙여 넣어 주세요." };
  const name = String(fd.get("name") ?? "").trim().slice(0, 50) || "구글 캘린더";
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("family_calendar_sources")
    .insert({ person, name, ics_url: url })
    .select("id")
    .single();
  if (error) return { error: `연결하지 못했어요: ${error.message}` };
  const r = await syncFamilySource(data.id as string);
  revalidatePath("/family", "layout");
  return r.error ? { error: `연결은 했지만 가져오지 못했어요: ${r.error}` } : {};
}

export async function deleteFamilySource(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("family_calendar_sources").delete().eq("id", id);
  revalidatePath("/family", "layout");
}

/** '지금 가져오기' */
export async function syncFamilySource(id: string): Promise<{ count?: number; error?: string }> {
  const { supabase } = await requireUser();
  const { data: src } = await supabase.from("family_calendar_sources").select("id, ics_url").eq("id", id).maybeSingle();
  if (!src) return { error: "연결된 캘린더를 찾지 못했어요." };
  try {
    const { from, rows } = await fetchImportRows(src.ics_url as string, todayInSeoul());
    const { data, error } = await supabase.rpc("save_family_import", { p_source: id, p_from: from, p_rows: rows, p_result: null });
    if (error) throw new Error(error.message);
    revalidatePath("/family", "layout");
    return { count: Number(data) || 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    await supabase.rpc("save_family_import", { p_source: id, p_from: todayInSeoul(), p_rows: null, p_result: `실패: ${msg}` });
    revalidatePath("/family", "layout");
    return { error: msg };
  }
}
