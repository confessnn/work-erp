"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";
import type { IncomeType } from "@/features/lectures/tax";
import { normalizeIcsUrl, type CalendarEvent } from "./ics";
import { collectAutoImportRows, eventToRow, type ImportSettings } from "./sync";

export type SourceState = { error?: string; message?: string };

export async function addSource(_prev: SourceState, fd: FormData): Promise<SourceState> {
  const { supabase } = await requireUser();
  const name = String(fd.get("name") ?? "").trim() || "내 캘린더";
  const url = normalizeIcsUrl(String(fd.get("ics_url") ?? ""));
  if (!url) return { error: "https:// 또는 webcal:// 로 시작하는 iCal 주소를 넣어주세요." };
  const { error } = await supabase.from("calendar_sources").insert({ name, ics_url: url });
  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath("/lectures/import");
  return {};
}

export async function deleteSource(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("calendar_sources").delete().eq("id", id);
  revalidatePath("/lectures/import");
}

function readSettings(fd: FormData): ImportSettings {
  return {
    keyword: String(fd.get("keyword") ?? "").trim() || null,
    hourly_rate: Math.max(0, Math.round(Number(fd.get("hourly_rate") ?? 0) || 0)),
    income_type: (fd.get("income_type") === "other" ? "other" : "business") as IncomeType,
    apply_tax_exemption: fd.get("apply_tax_exemption") === "on",
    org_from_location: fd.get("org_from_location") === "on",
  };
}

/** 자동 불러오기 설정 저장 */
export async function saveAutoSettings(id: string, _prev: SourceState, fd: FormData): Promise<SourceState> {
  const { supabase } = await requireUser();
  const settings = readSettings(fd);
  const auto = fd.get("auto_import") === "on";
  const { error } = await supabase
    .from("calendar_sources")
    .update({ ...settings, auto_import: auto })
    .eq("id", id);
  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath("/lectures/import");
  return { message: auto ? "저장했습니다. 매일 아침 자동으로 불러옵니다." : "저장했습니다. 자동 불러오기는 꺼져 있습니다." };
}

/** '지금 불러오기': 자동 불러오기와 같은 규칙으로 즉시 실행 */
export async function syncNow(id: string): Promise<SourceState> {
  const { supabase, userId } = await requireUser();
  const { data: s } = await supabase.from("calendar_sources").select("*").eq("id", id).single();
  if (!s) return { error: "캘린더를 찾지 못했습니다." };

  const [{ data: l }, { data: k }] = await Promise.all([
    supabase.from("lectures").select("external_uid").not("external_uid", "is", null),
    supabase.from("import_skips").select("external_uid"),
  ]);
  const known = new Set([...(l ?? []), ...(k ?? [])].map((r) => r.external_uid as string));

  let rows;
  try {
    rows = await collectAutoImportRows(s.ics_url, s as ImportSettings, known, todayInSeoul());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "불러오기 실패";
    await supabase.from("calendar_sources").update({ last_synced_at: new Date().toISOString(), last_sync_result: `실패: ${msg}` }).eq("id", id);
    revalidatePath("/lectures/import");
    return { error: msg };
  }

  if (rows.length) {
    const { error } = await supabase.from("lectures").insert(rows.map((r) => ({ ...r, user_id: userId })));
    if (error) return { error: `저장 실패: ${error.message}` };
  }
  await supabase
    .from("calendar_sources")
    .update({ last_synced_at: new Date().toISOString(), last_sync_result: `수동: ${rows.length}건 새로 추가` })
    .eq("id", id);
  revalidatePath("/", "layout");
  return { message: rows.length ? `${rows.length}개 일정을 새로 불러왔습니다.` : "새로 불러올 일정이 없습니다." };
}

/**
 * 목록에서 골라서 불러오기.
 * 폼: event(JSON, 여러 개) / hourly_rate / income_type / apply_tax_exemption / organization_from_location
 */
export async function importEvents(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const settings = {
    hourly_rate: Math.max(0, Math.round(Number(fd.get("hourly_rate") ?? 0) || 0)),
    income_type: (fd.get("income_type") === "other" ? "other" : "business") as IncomeType,
    apply_tax_exemption: fd.get("apply_tax_exemption") === "on",
    org_from_location: fd.get("organization_from_location") === "on",
  };

  const events = fd
    .getAll("event")
    .map((v) => {
      try {
        return JSON.parse(String(v)) as CalendarEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is CalendarEvent => !!e && typeof e.uid === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date));

  if (events.length === 0) redirect("/lectures/import?msg=none");

  const rows = events.map((e) => ({ ...eventToRow({ ...e, title: String(e.title) }, settings), user_id: userId }));

  // 이미 불러온 일정(external_uid 중복)은 건너뛴다
  const { data: existing } = await supabase
    .from("lectures")
    .select("external_uid")
    .in("external_uid", rows.map((r) => r.external_uid));
  const skip = new Set((existing ?? []).map((r) => r.external_uid));
  const fresh = rows.filter((r) => !skip.has(r.external_uid));

  if (fresh.length) {
    const { error } = await supabase.from("lectures").insert(fresh);
    if (error) redirect(`/lectures/import?msg=error`);
    // 직접 골라 다시 불러온 일정은 '삭제했던 일정' 기록에서 뺀다
    await supabase.from("import_skips").delete().in("external_uid", fresh.map((r) => r.external_uid));
  }
  revalidatePath("/", "layout");
  redirect(`/lectures/import?msg=ok&n=${fresh.length}`);
}
