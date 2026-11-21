"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { normalizeIcsUrl } from "@/features/calendar-import/ics";
import { todayInSeoul } from "@/lib/format";
import { parseEventInput } from "./form";
import { fetchImportRows } from "./import";
import { findMyOverlaps, overlapLabel } from "./overlap";
import { getFamilyRole } from "./queries";
import { schedulePush } from "@/features/google-calendar/push";
import { calculateWithholding, hoursBetween } from "@/features/lectures/tax";

/** overlaps: 시간이 겹치는 일정 (있으면 저장하지 않고 다시 묻는다) */
export type FamilyFormState = { error?: string; overlaps?: string[] };

/** 가족 일정 추가(id 없음) / 수정 */
export async function saveFamilyEvent(id: string | null, _prev: FamilyFormState, fd: FormData): Promise<FamilyFormState> {
  const parsed = parseEventInput((k) => fd.get(k));
  if (!parsed.ok) return { error: parsed.error };
  const { supabase } = await requireUser();
  if (fd.get("allow_overlap") !== "on") {
    const v = parsed.value;
    const overlaps = await findMyOverlaps(supabase, v.event_date, v.start_time, v.end_time, id);
    if (overlaps.length) return { overlaps: overlaps.map(overlapLabel) };
  }
  const { error } = id
    ? await supabase
        .from("family_events")
        .update({ ...parsed.value, updated_at: new Date().toISOString() })
        .eq("id", id)
    : await supabase.from("family_events").insert(parsed.value);
  if (error) return { error: `저장하지 못했어요: ${error.message}` };
  revalidatePath("/family");
  revalidatePath("/lectures");
  const [y, m] = parsed.value.event_date.split("-");
  // 가족을 만든 사람(나)은 '일정' 탭 달력으로, 초대받은 가족은 가족 달력으로 돌아간다
  const owner = (await getFamilyRole()).role === "owner";
  redirect(owner || fd.get("back") === "lectures" ? `/lectures?view=calendar&y=${Number(y)}&m=${Number(m)}` : `/family?y=${Number(y)}&m=${Number(m)}`);
}

export async function deleteFamilyEvent(id: string, back?: "lectures") {
  const { supabase } = await requireUser();
  await supabase.from("family_events").delete().eq("id", id);
  revalidatePath("/family");
  revalidatePath("/lectures");
  const owner = (await getFamilyRole()).role === "owner";
  redirect(owner || back === "lectures" ? "/lectures?view=calendar" : "/family");
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
  revalidatePath("/share-settings");
  return {};
}

export async function deleteFamilyInvite(token: string) {
  const { supabase } = await requireUser();
  await supabase.from("family_invites").delete().eq("token", token);
  revalidatePath("/share-settings");
}

/** 가족에서 내보내기 (가족을 만든 사람) */
export async function removeFamilyMember(memberId: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("family_members").delete().eq("member_id", memberId).eq("owner_id", userId);
  revalidatePath("/share-settings");
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

/**
 * 가족 일정을 다른 달력으로 옮긴다.
 * - 아빠·엄마·임채현·가족: 누구의 일정인지만 바꾼다
 * - 강의: 강의 일정을 만들고(강의료는 비워 둠) 가족 일정은 지운다. 가족을 만든 사람만
 * 구글 캘린더에서 가져온 일정은 다음 가져오기 때 되돌아가므로 옮기지 않는다.
 */
export async function moveFamilyEvent(id: string, to: string): Promise<{ error?: string }> {
  const { supabase, userId } = await requireUser();
  const { data: e } = await supabase
    .from("family_events")
    .select("title, event_date, start_time, end_time, memo, source_id")
    .eq("id", id)
    .maybeSingle();
  if (!e) return { error: "일정을 찾지 못했어요." };
  if (e.source_id) return { error: "구글 캘린더에서 가져온 일정은 옮길 수 없어요." };
  const [y, m] = String(e.event_date).split("-");
  const owner = (await getFamilyRole()).role === "owner";
  const back = owner ? `/lectures?y=${Number(y)}&m=${Number(m)}` : `/family?y=${Number(y)}&m=${Number(m)}`;

  if (["dad", "mom", "baby", "all"].includes(to)) {
    const { error } = await supabase.from("family_events").update({ person: to, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { error: `옮기지 못했어요: ${error.message}` };
  } else if (to === "lecture") {
    if (!owner) return { error: "강의 일정으로는 가족을 만든 사람만 옮길 수 있어요." };
    const tax = calculateWithholding(0, "business", true);
    const { error } = await supabase.from("lectures").insert({
      user_id: userId,
      title: e.title,
      lecture_date: e.event_date,
      start_time: e.start_time,
      end_time: e.end_time,
      hours: hoursBetween(e.start_time, e.end_time),
      hourly_rate: 0,
      gross_amount: 0,
      income_type: "business",
      apply_tax_exemption: true,
      income_tax: tax.incomeTax,
      local_tax: tax.localTax,
      expected_net: tax.net,
      is_paid: false,
      memo: e.memo,
    });
    if (error) return { error: `옮기지 못했어요: ${error.message}` };
    await supabase.from("family_events").delete().eq("id", id);
    schedulePush(supabase);
  } else {
    return { error: "옮길 달력을 골라 주세요." };
  }
  revalidatePath("/family");
  revalidatePath("/lectures");
  revalidatePath("/", "layout");
  redirect(back);
}
