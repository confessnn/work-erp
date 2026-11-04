import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { todayInSeoul } from "@/lib/format";
import { parseIcs, type CalendarEvent } from "./ics";

export type CalendarSource = {
  id: string;
  name: string;
  ics_url: string;
  last_synced_at: string | null;
};

export async function listSources(): Promise<CalendarSource[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("calendar_sources")
    .select("id, name, ics_url, last_synced_at")
    .order("created_at");
  return (data ?? []) as CalendarSource[];
}

function addDays(d: string, n: number) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
}

export type Candidate = CalendarEvent & { imported: boolean };

/** 캘린더 주소에서 일정을 받아와, 이미 불러온 것은 imported=true 로 표시 */
export async function fetchCandidates(
  source: CalendarSource,
  range: { pastDays: number; futureDays: number },
): Promise<{ events: Candidate[]; error?: string }> {
  const { supabase } = await requireUser();
  const today = todayInSeoul();
  const from = addDays(today, -range.pastDays);
  const to = addDays(today, range.futureDays);

  let text: string;
  try {
    const res = await fetch(source.ics_url, {
      signal: AbortSignal.timeout(15_000),
      headers: { accept: "text/calendar, */*" },
      cache: "no-store",
    });
    if (!res.ok) return { events: [], error: `캘린더를 받아오지 못했습니다 (HTTP ${res.status}). 주소를 확인하세요.` };
    text = await res.text();
    if (text.length > 10_000_000) return { events: [], error: "캘린더 파일이 너무 큽니다." };
  } catch {
    return { events: [], error: "캘린더 주소에 연결하지 못했습니다. 주소를 확인하세요." };
  }

  let events: CalendarEvent[];
  try {
    events = parseIcs(text, from, to);
  } catch {
    return { events: [], error: "캘린더 형식을 읽지 못했습니다. iCal(.ics) 주소가 맞는지 확인하세요." };
  }

  const { data } = await supabase
    .from("lectures")
    .select("external_uid")
    .not("external_uid", "is", null)
    .gte("lecture_date", from);
  const done = new Set((data ?? []).map((r) => r.external_uid as string));

  await supabase.from("calendar_sources").update({ last_synced_at: new Date().toISOString() }).eq("id", source.id);

  return { events: events.map((e) => ({ ...e, imported: done.has(e.uid) })) };
}
