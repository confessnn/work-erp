import "server-only";
import { requireUser } from "@/lib/supabase/server";

export type BabyInfo = { name: string | null; birthDate: string | null };

export async function getBabyInfo(): Promise<BabyInfo> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_settings").select("baby_name, baby_birth_date").maybeSingle();
  return { name: data?.baby_name ?? null, birthDate: data?.baby_birth_date ?? null };
}

export type BabyPhoto = {
  id: string;
  drive_file_id: string;
  file_name: string;
  taken_at: string | null;
  taken_date: string;
  date_source: "exif" | "file" | "manual";
  thumb: string | null;
};

/** 월별 사진 수 (최근 달부터) */
export async function listPhotoMonths(): Promise<{ month: string; count: number }[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("baby_photos").select("taken_date").order("taken_date", { ascending: false });
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const m = (r.taken_date as string).slice(0, 7);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()].map(([month, count]) => ({ month, count }));
}

/** 한 달 사진 (날짜·시각 순) */
export async function listPhotosInMonth(month: string): Promise<BabyPhoto[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  const { supabase } = await requireUser();
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const { data } = await supabase
    .from("baby_photos")
    .select("id, drive_file_id, file_name, taken_at, taken_date, date_source, thumb")
    .gte("taken_date", `${month}-01`)
    .lt("taken_date", next)
    .order("taken_date", { ascending: true })
    .order("taken_at", { ascending: true, nullsFirst: true });
  return (data ?? []) as BabyPhoto[];
}
