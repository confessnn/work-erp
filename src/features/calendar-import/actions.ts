"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { calculateWithholding, grossFrom, hoursBetween, type IncomeType } from "@/features/lectures/tax";
import { normalizeIcsUrl, type CalendarEvent } from "./ics";

export type SourceState = { error?: string };

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

/**
 * 선택한 캘린더 일정을 강의로 저장.
 * 폼: event(JSON, 여러 개) / hourly_rate / income_type / apply_tax_exemption / organization_from_location
 */
export async function importEvents(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const hourlyRate = Math.max(0, Math.round(Number(fd.get("hourly_rate") ?? 0) || 0));
  const incomeType: IncomeType = fd.get("income_type") === "other" ? "other" : "business";
  const applyExemption = fd.get("apply_tax_exemption") === "on";
  const orgFromLocation = fd.get("organization_from_location") === "on";

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

  const rows = events.map((e) => {
    const hours = hoursBetween(e.start, e.end);
    const gross = grossFrom(hours, hourlyRate);
    const tax = calculateWithholding(gross, incomeType, applyExemption);
    return {
      user_id: userId,
      external_uid: e.uid,
      title: String(e.title).slice(0, 200),
      organization: orgFromLocation && e.location ? String(e.location).slice(0, 200) : null,
      lecture_date: e.date,
      start_time: e.start,
      end_time: e.end,
      hours,
      hourly_rate: hourlyRate,
      gross_amount: gross,
      income_type: incomeType,
      apply_tax_exemption: applyExemption,
      income_tax: tax.incomeTax,
      local_tax: tax.localTax,
      expected_net: tax.net,
    };
  });

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
  }
  revalidatePath("/", "layout");
  redirect(`/lectures/import?msg=ok&n=${fresh.length}`);
}
