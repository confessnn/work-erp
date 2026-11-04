"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { decryptSecret } from "@/features/google-calendar/crypto";
import { accessToken, DRIVE_SCOPE, hasScope } from "@/features/google-calendar/google-api";
import { ensureFolders, getFile, shareWithLink, stopSharing, trashFile } from "./drive";
import { isDocType } from "./types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** 서버용 드라이브 토큰 + 폴더 (없으면 생성) */
async function driveContext() {
  const { supabase, userId } = await requireUser();
  const { data: conn } = await supabase.from("google_connections").select("*").maybeSingle();
  if (!conn) throw new Error("구글이 연결되어 있지 않습니다. '연동' 화면에서 연결해주세요.");
  if (!hasScope(conn.scopes, DRIVE_SCOPE)) {
    throw new Error("드라이브 권한이 없습니다. '연동' 화면에서 구글을 다시 연결해주세요.");
  }
  const refresh = decryptSecret(conn.refresh_token_enc);
  const { token } = await accessToken(refresh, [DRIVE_SCOPE]);
  const folders = await ensureFolders(token, { docs: conn.drive_docs_folder_id, bundles: conn.drive_bundles_folder_id });
  if (folders.changed) {
    await supabase
      .from("google_connections")
      .update({ drive_docs_folder_id: folders.docs, drive_bundles_folder_id: folders.bundles })
      .eq("user_id", userId);
  }
  return { supabase, userId, token, refresh, folders };
}

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "알 수 없는 오류" });

/**
 * 브라우저가 드라이브에 직접 올리고/받기 위한 짧은 토큰 (1시간, 드라이브 '앱이 만든 파일' 권한만).
 * 큰 스캔 파일은 서버(약 4.5MB 제한)를 거치지 않고 브라우저 ↔ 드라이브로 바로 오간다.
 */
export async function getDriveSession(): Promise<
  Result<{ token: string; expiresAt: number; docsFolderId: string; bundlesFolderId: string; displayName: string }>
> {
  try {
    const { supabase, token, folders } = await driveContext();
    const { data: s } = await supabase.from("user_settings").select("display_name").maybeSingle();
    return {
      ok: true,
      token,
      expiresAt: Date.now() + 50 * 60_000,
      docsFolderId: folders.docs,
      bundlesFolderId: folders.bundles,
      displayName: s?.display_name ?? "",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function saveDisplayName(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const name = String(fd.get("display_name") ?? "").trim().slice(0, 30);
  await supabase.from("user_settings").upsert({ user_id: userId, display_name: name, updated_at: new Date().toISOString() });
  revalidatePath("/documents");
}

/** 브라우저가 서류함 폴더에 올린 파일을 등록 (서버가 드라이브에서 직접 확인) */
export async function registerDocument(input: {
  driveFileId: string;
  docType: string;
  title?: string;
  issuedOn?: string;
  replaceIds?: string[]; // 새 버전으로 바꿀 기존 서류 → 보관 처리
}): Promise<Result> {
  try {
    if (!isDocType(input.docType)) return { ok: false, error: "서류 종류가 올바르지 않습니다." };
    const { supabase, token, folders } = await driveContext();
    const f = await getFile(token, input.driveFileId);
    if (f.trashed || !f.parents?.includes(folders.docs)) {
      return { ok: false, error: "서류함 폴더에 올라간 파일이 아닙니다." };
    }
    const issued = input.issuedOn && /^\d{4}-\d{2}-\d{2}$/.test(input.issuedOn) ? input.issuedOn : null;
    const { error } = await supabase.from("documents").insert({
      doc_type: input.docType,
      title: input.title?.trim().slice(0, 50) || null,
      issued_on: issued,
      drive_file_id: f.id,
      file_name: f.name,
      mime_type: f.mimeType,
      size_bytes: f.size ? Number(f.size) : null,
    });
    if (error) return { ok: false, error: `저장 실패: ${error.message}` };
    if (input.replaceIds?.length) {
      await supabase.from("documents").update({ archived: true }).in("id", input.replaceIds);
    }
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setArchived(id: string, archived: boolean) {
  const { supabase } = await requireUser();
  await supabase.from("documents").update({ archived }).eq("id", id);
  revalidatePath("/documents");
}

export async function updateDocumentInfo(id: string, fd: FormData) {
  const { supabase } = await requireUser();
  const issued = String(fd.get("issued_on") ?? "");
  await supabase
    .from("documents")
    .update({
      title: String(fd.get("title") ?? "").trim().slice(0, 50) || null,
      issued_on: /^\d{4}-\d{2}-\d{2}$/.test(issued) ? issued : null,
    })
    .eq("id", id);
  revalidatePath("/documents");
}

/** 서류 삭제: ERP 목록에서 지우고 드라이브 파일은 휴지통으로 (30일 안에 드라이브에서 복구 가능) */
export async function deleteDocument(id: string): Promise<Result> {
  try {
    const { supabase, token } = await driveContext();
    const { data: d } = await supabase.from("documents").select("drive_file_id").eq("id", id).single();
    if (d) await trashFile(token, d.drive_file_id);
    await supabase.from("documents").delete().eq("id", id);
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 제출 기록 (압축 다운로드 / 드라이브 링크 공통) */
export async function recordSubmission(input: {
  lectureId: string;
  documentIds: string[];
  zipName: string;
  fileNames: string[];
  method: "download" | "drive_link";
  bundleFileId?: string;
}): Promise<Result<{ shareUrl?: string; submissionId?: string }>> {
  try {
    const { supabase } = await requireUser();
    const { data: docs } = await supabase.from("documents").select("id, doc_type").in("id", input.documentIds);
    if (!docs?.length) return { ok: false, error: "선택한 서류를 찾지 못했습니다." };
    const docTypes = [...new Set(docs.map((d) => d.doc_type as string))];

    let shareUrl: string | undefined;
    if (input.method === "drive_link") {
      if (!input.bundleFileId) return { ok: false, error: "압축파일이 드라이브에 올라가지 않았습니다." };
      const { token, folders } = await driveContext();
      const f = await getFile(token, input.bundleFileId);
      if (!f.parents?.includes(folders.bundles)) return { ok: false, error: "제출용 폴더의 파일이 아닙니다." };
      shareUrl = await shareWithLink(token, f.id);
    }

    const { data: row, error } = await supabase
      .from("document_submissions")
      .insert({
        lecture_id: input.lectureId,
        doc_types: docTypes,
        document_ids: docs.map((d) => d.id),
        file_names: input.fileNames.slice(0, 50),
        zip_name: input.zipName.slice(0, 200),
        method: input.method,
        drive_file_id: input.bundleFileId ?? null,
        share_url: shareUrl ?? null,
        shared: input.method === "drive_link",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `기록 실패: ${error.message}` };
    revalidatePath(`/lectures/${input.lectureId}`);
    revalidatePath("/documents");
    return { ok: true, shareUrl, submissionId: row.id };
  } catch (e) {
    return fail(e);
  }
}

/** 공유 중지: 링크로 더 이상 열 수 없게 하고, 압축파일은 휴지통으로 */
export async function stopBundleSharing(submissionId: string): Promise<Result> {
  try {
    const { supabase, token } = await driveContext();
    const { data: s } = await supabase
      .from("document_submissions")
      .select("drive_file_id, lecture_id")
      .eq("id", submissionId)
      .single();
    if (s?.drive_file_id) {
      await stopSharing(token, s.drive_file_id);
      await trashFile(token, s.drive_file_id);
    }
    await supabase.from("document_submissions").update({ shared: false }).eq("id", submissionId);
    if (s) revalidatePath(`/lectures/${s.lecture_id}`);
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
