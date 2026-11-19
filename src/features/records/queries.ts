import "server-only";
import { requireUser } from "@/lib/supabase/server";
import type { RecordEntry } from "./series";

type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** 개인용이라 이만큼이면 몇 년 치. 넘으면 오래된 것부터 빠진다 */
const LIMIT = 2000;

/** 기록이 있는 강의·가족 일정 전부 (RLS: 내 강의, 우리 가족 일정) */
export async function listRecordEntries(db?: Db): Promise<RecordEntry[]> {
  const supabase = db ?? (await requireUser()).supabase;
  const [lectures, family] = await Promise.all([
    supabase
      .from("lectures")
      .select("id, title, organization, lecture_date, start_time, record")
      .not("record", "is", null)
      .order("lecture_date", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("family_events")
      .select("id, title, event_date, start_time, record")
      .not("record", "is", null)
      .order("event_date", { ascending: false })
      .limit(LIMIT),
  ]);
  if (lectures.error) throw new Error(lectures.error.message);
  if (family.error) throw new Error(family.error.message);
  return [
    ...(lectures.data ?? []).map((l) => ({
      kind: "lecture" as const,
      id: l.id as string,
      title: l.title as string,
      organization: (l.organization as string | null) ?? null,
      date: l.lecture_date as string,
      start_time: (l.start_time as string | null) ?? null,
      record: l.record as string,
    })),
    ...(family.data ?? []).map((f) => ({
      kind: "family" as const,
      id: f.id as string,
      title: f.title as string,
      organization: null,
      date: f.event_date as string,
      start_time: (f.start_time as string | null) ?? null,
      record: f.record as string,
    })),
  ].filter((e) => e.record.trim() !== "");
}
