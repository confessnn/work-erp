import "server-only";
import { DRIVE_READ_SCOPE, DRIVE_SCOPE, hasScope } from "@/features/google-calendar/google-api";
import { requireUser } from "@/lib/supabase/server";
import type { BrainNote, BrainNoteMeta, BrainSettings, BrainStatus } from "./types";

const META = "id, drive_file_id, path, title, section, links, tags, modified_at";
/** 개인 볼트로는 넉넉한 수. 넘으면 오래 안 고친 노트부터 빠진다 */
const LIMIT = 5000;

export async function brainStatus(): Promise<BrainStatus> {
  const { supabase } = await requireUser();
  const [{ data: conn }, { data: settings }] = await Promise.all([
    supabase.from("google_connections").select("scopes").maybeSingle(),
    supabase.from("brain_settings").select("*").maybeSingle(),
  ]);
  if (!conn) return { kind: "no_google" };
  if (!hasScope(conn.scopes, DRIVE_SCOPE) || !hasScope(conn.scopes, DRIVE_READ_SCOPE)) return { kind: "needs_reconnect" };
  if (!settings) return { kind: "no_vault" };
  return { kind: "ready", settings: settings as BrainSettings };
}

/** 모든 노트 (본문 없이) — 최근에 고친 것부터 */
export async function listNoteMeta(): Promise<BrainNoteMeta[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("brain_notes").select(META).order("modified_at", { ascending: false }).limit(LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as BrainNoteMeta[];
}

export async function getNote(id: string): Promise<BrainNote | null> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("brain_notes").select(`${META}, content`).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BrainNote | null) ?? null;
}

/** 제목·경로·본문에서 찾기 */
export async function searchNotes(q: string): Promise<BrainNote[]> {
  const { supabase } = await requireUser();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // or() 안에서 쉼표·괄호가 문법을 깨지 않게 큰따옴표로 감싼다
  const quoted = `"${like.replace(/"/g, '\\"')}"`;
  const { data, error } = await supabase
    .from("brain_notes")
    .select(`${META}, content`)
    .or(`title.ilike.${quoted},path.ilike.${quoted},content.ilike.${quoted}`)
    .order("modified_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as BrainNote[];
}

/** 태그가 붙은 노트 */
export async function notesWithTag(tag: string): Promise<BrainNoteMeta[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("brain_notes").select(META).contains("tags", [tag]).order("modified_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as BrainNoteMeta[];
}
