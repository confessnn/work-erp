import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";
import type { IncomeType } from "@/features/lectures/tax";
import { parseIcs, type CalendarEvent } from "./ics";
import { addDays, downloadIcs } from "./sync";

export type CalendarSource = {
  id: string;
  name: string;
  ics_url: string;
  last_synced_at: string | null;
  last_sync_result: string | null;
  auto_import: boolean;
  keyword: string | null;
  hourly_rate: number;
  income_type: IncomeType;
  apply_tax_exemption: boolean;
  org_from_location: boolean;
};

export async function listSources(): Promise<CalendarSource[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("calendar_sources")
    .select(
      "id, name, ics_url, last_synced_at, last_sync_result, auto_import, keyword, hourly_rate, income_type, apply_tax_exemption, org_from_location",
    )
    .order("created_at");
  return (data ?? []) as CalendarSource[];
}

export type Candidate = CalendarEvent & { imported: boolean };

/** 캘린더 주소에서 일정을 받아와, 이미 불러온 것은 imported=true 로 표시 (수동 불러오기 화면용) */
export async function fetchCandidates(
  source: CalendarSource,
  range: { pastDays: number; futureDays: number },
): Promise<{ events: Candidate[]; error?: string }> {
  const { supabase } = await requireUser();
  const today = todayInSeoul();
  const from = addDays(today, -range.pastDays);
  const to = addDays(today, range.futureDays);

  let events: CalendarEvent[];
  try {
    events = parseIcs(await downloadIcs(source.ics_url), from, to);
  } catch (e) {
    const msg = e instanceof Error && /[가-힣]/.test(e.message) ? e.message : "캘린더 형식을 읽지 못했습니다. iCal(.ics) 주소가 맞는지 확인하세요.";
    return { events: [], error: msg };
  }

  const { data } = await supabase
    .from("lectures")
    .select("external_uid")
    .not("external_uid", "is", null)
    .gte("lecture_date", from);
  const done = new Set((data ?? []).map((r) => r.external_uid as string));

  return { events: events.map((e) => ({ ...e, imported: done.has(e.uid) })) };
}
