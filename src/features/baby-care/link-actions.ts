"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { describeSite } from "./link-reader";
import { LINK_COLUMNS, normalizeUrl, type BabyLink } from "./links";

// 아기 링크 쓰기. 가족(나·아내) 누구나 (DB 정책 baby_links_*_family)

type Result = { ok: true; link?: BabyLink } | { ok: false; message: string };
const clip = (s: string | null | undefined, n: number) => (s?.trim() ? s.trim().slice(0, n) : null);

/** 주소를 넣으면 사이트를 읽어 제목·설명을 붙여 저장한다 */
export async function addBabyLink(raw: string, note?: string): Promise<Result> {
  const url = normalizeUrl(raw);
  if (!url) return { ok: false, message: "주소를 확인해 주세요. 예: https://nip.kdca.go.kr" };
  const { supabase } = await requireUser();
  const d = await describeSite(url);
  const { data, error } = await supabase
    .from("baby_links")
    .insert({ url, title: clip(d.title, 200), description: clip(d.description, 1000), note: clip(note, 1000) })
    .select(LINK_COLUMNS)
    .single();
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  revalidatePath("/baby/links");
  return { ok: true, link: data as BabyLink };
}

/** 사이트를 다시 읽어 제목·설명을 새로 만든다 */
export async function refreshBabyLink(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { data: row } = await supabase.from("baby_links").select("url").eq("id", id).maybeSingle();
  if (!row) return { ok: false, message: "지워졌거나 찾을 수 없는 링크예요." };
  const d = await describeSite(row.url as string);
  const { data, error } = await supabase
    .from("baby_links")
    .update({ title: clip(d.title, 200), description: clip(d.description, 1000) })
    .eq("id", id)
    .select(LINK_COLUMNS)
    .single();
  if (error) return { ok: false, message: error.message };
  revalidatePath("/baby/links");
  return { ok: true, link: data as BabyLink };
}

/** 제목·설명·메모 직접 고치기 */
export async function updateBabyLink(id: string, v: { title: string; description: string; note: string }): Promise<Result> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("baby_links")
    .update({ title: clip(v.title, 200), description: clip(v.description, 1000), note: clip(v.note, 1000) })
    .eq("id", id)
    .select(LINK_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "지워졌거나 찾을 수 없는 링크예요." };
  revalidatePath("/baby/links");
  return { ok: true, link: data as BabyLink };
}

export async function deleteBabyLink(id: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("baby_links").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/baby/links");
  return { ok: true };
}
