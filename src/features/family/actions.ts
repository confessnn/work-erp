"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { parseEventInput } from "./form";
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
