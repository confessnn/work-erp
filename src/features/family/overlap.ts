import type { requireUser } from "@/lib/supabase/server";

// 일정 시간 겹침 (supabase/migrations/20261119030000_schedule_overlaps.sql)
// 끝 시간이 없으면 1시간짜리로 보고, 종일 일정은 겹침으로 치지 않는다. 찾는 일은 DB 함수가 한다.

export type Overlap = {
  kind: "event" | "lecture";
  title: string;
  person: string | null;
  start_time: string;
  end_time: string | null;
};

const PERSON: Record<string, string> = { dad: "아빠", mom: "엄마", baby: "아기", all: "가족" };

/** "15:00~16:00 치과 (아빠)" */
export function overlapLabel(o: Overlap): string {
  const time = `${o.start_time.slice(0, 5)}${o.end_time ? `~${o.end_time.slice(0, 5)}` : ""}`;
  const who = o.kind === "lecture" ? "강의" : (PERSON[o.person ?? ""] ?? "가족");
  return `${time} ${o.title} (${who})`;
}

type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** 로그인한 사람 가족의 겹치는 일정 (최대 5개). 확인에 실패하면 빈 목록 (저장은 막지 않는다) */
export async function findMyOverlaps(
  db: Db,
  date: string,
  start: string | null,
  end: string | null,
  skip: string | null = null,
): Promise<Overlap[]> {
  if (!start) return [];
  const { data, error } = await db.rpc("my_schedule_overlaps", { p_date: date, p_start: start, p_end: end, p_skip: skip });
  if (error) {
    console.error("일정 겹침 확인 실패", error.message);
    return [];
  }
  return (data ?? []) as Overlap[];
}
