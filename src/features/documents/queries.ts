import "server-only";
import { requireUser } from "@/lib/supabase/server";
import { DRIVE_SCOPE, hasScope, isGoogleConfigured } from "@/features/google-calendar/google-api";
import type { DocumentRow, SubmissionRow } from "./types";

export async function getDisplayName(): Promise<string> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_settings").select("display_name").maybeSingle();
  return data?.display_name ?? "";
}

/** 드라이브 사용 가능 상태 */
export async function driveStatus(): Promise<"not_configured" | "not_connected" | "needs_reconnect" | "ready"> {
  if (!isGoogleConfigured()) return "not_configured";
  const { supabase } = await requireUser();
  const { data } = await supabase.from("google_connections").select("scopes").maybeSingle();
  if (!data) return "not_connected";
  return hasScope(data.scopes, DRIVE_SCOPE) ? "ready" : "needs_reconnect";
}

export async function listDocuments(opts: { includeArchived?: boolean } = {}): Promise<DocumentRow[]> {
  const { supabase } = await requireUser();
  let q = supabase
    .from("documents")
    .select("id, doc_type, title, issued_on, drive_file_id, file_name, mime_type, size_bytes, archived, created_at")
    .order("created_at", { ascending: false });
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data ?? []) as DocumentRow[];
}

export async function listSubmissions(lectureId: string): Promise<SubmissionRow[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("document_submissions")
    .select("id, lecture_id, doc_types, document_ids, file_names, zip_name, method, share_url, shared, created_at")
    .eq("lecture_id", lectureId)
    .order("created_at", { ascending: false });
  return (data ?? []) as SubmissionRow[];
}

/** 같은 기관에 마지막으로 냈던 서류 종류 (미리 체크용) */
export async function lastDocTypesForOrganization(organization: string | null, exceptLectureId: string): Promise<string[]> {
  if (!organization) return [];
  const { supabase } = await requireUser();
  const { data: lectures } = await supabase
    .from("lectures")
    .select("id")
    .eq("organization", organization)
    .neq("id", exceptLectureId);
  const ids = (lectures ?? []).map((l) => l.id);
  if (!ids.length) return [];
  const { data } = await supabase
    .from("document_submissions")
    .select("doc_types")
    .in("lecture_id", ids)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.doc_types ?? [];
}

/** 드라이브에 올려둔 공유 중인 압축파일 전체 (공유 중지 관리용) */
export async function listSharedBundles() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("document_submissions")
    .select("id, lecture_id, zip_name, share_url, created_at, lectures(title, lecture_date)")
    .eq("shared", true)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as {
    id: string;
    lecture_id: string;
    zip_name: string;
    share_url: string | null;
    created_at: string;
    lectures: { title: string; lecture_date: string } | null;
  }[];
}
