"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { driveContext } from "@/features/google-drive/context";
import { getFile, shareWithLink, stopSharing, trashFile } from "./drive";
import { isDocType } from "./types";
import { schedulePush } from "@/features/google-calendar/push";
import { todayInSeoul } from "@/lib/format";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

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

const memoLine = (url: string) => `제출 서류(${todayInSeoul()}): ${url}`;

/**
 * 제출 기록 (압축파일 / 드라이브 링크 공통). 서류함에서 하면 lectureId 없이도 된다.
 * attachToLecture: 공유 링크를 그 일정의 메모에 붙인다 → 구글 캘린더 'ERP' 일정 메모에도 반영
 */
export async function recordSubmission(input: {
  lectureId: string | null;
  documentIds: string[];
  zipName: string;
  fileNames: string[];
  method: "download" | "drive_link";
  bundleFileId?: string;
  attachToLecture?: boolean;
}): Promise<Result<{ shareUrl?: string; submissionId?: string; attachedTitle?: string }>> {
  try {
    const { supabase } = await requireUser();
    const { data: docs } = await supabase.from("documents").select("id, doc_type").in("id", input.documentIds);
    if (!docs?.length) return { ok: false, error: "선택한 서류를 찾지 못했습니다." };
    const docTypes = [...new Set(docs.map((d) => d.doc_type as string))];

    let lecture: { id: string; title: string; memo: string | null } | null = null;
    if (input.lectureId) {
      const { data } = await supabase.from("lectures").select("id, title, memo").eq("id", input.lectureId).maybeSingle();
      if (!data) return { ok: false, error: "선택한 일정을 찾지 못했습니다." };
      lecture = data;
    }
    if (input.attachToLecture && !lecture) return { ok: false, error: "링크를 넣을 일정을 선택해주세요." };

    let shareUrl: string | undefined;
    if (input.method === "drive_link") {
      if (!input.bundleFileId) return { ok: false, error: "압축파일이 드라이브에 올라가지 않았습니다." };
      const { token, folders } = await driveContext();
      const f = await getFile(token, input.bundleFileId);
      if (!f.parents?.includes(folders.bundles)) return { ok: false, error: "제출용 폴더의 파일이 아닙니다." };
      shareUrl = await shareWithLink(token, f.id);
    }

    const attach = Boolean(input.attachToLecture && lecture && shareUrl);
    const { data: row, error } = await supabase
      .from("document_submissions")
      .insert({
        lecture_id: lecture?.id ?? null,
        doc_types: docTypes,
        document_ids: docs.map((d) => d.id),
        file_names: input.fileNames.slice(0, 50),
        zip_name: input.zipName.slice(0, 200),
        method: input.method,
        drive_file_id: input.bundleFileId ?? null,
        share_url: shareUrl ?? null,
        shared: input.method === "drive_link",
        attached_to_lecture: attach,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `기록 실패: ${error.message}` };

    if (attach && lecture && shareUrl) {
      const memo = [lecture.memo?.trim(), memoLine(shareUrl)].filter(Boolean).join("\n");
      await supabase.from("lectures").update({ memo }).eq("id", lecture.id);
      schedulePush(supabase); // 구글 캘린더 일정 메모에도 반영
      revalidatePath("/", "layout");
    }
    if (lecture) revalidatePath(`/lectures/${lecture.id}`);
    revalidatePath("/documents");
    return { ok: true, shareUrl, submissionId: row.id, attachedTitle: attach ? lecture?.title : undefined };
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
      .select("drive_file_id, lecture_id, share_url, attached_to_lecture")
      .eq("id", submissionId)
      .single();
    if (s?.drive_file_id) {
      await stopSharing(token, s.drive_file_id);
      await trashFile(token, s.drive_file_id);
    }
    // 일정 메모에 붙였던 링크도 지운다 (구글 캘린더 일정 메모에도 반영)
    if (s?.attached_to_lecture && s.lecture_id && s.share_url) {
      const { data: l } = await supabase.from("lectures").select("memo").eq("id", s.lecture_id).maybeSingle();
      if (l?.memo?.includes(s.share_url)) {
        const memo = l.memo
          .split("\n")
          .filter((line: string) => !line.includes(s.share_url!))
          .join("\n")
          .trim();
        await supabase.from("lectures").update({ memo: memo || null }).eq("id", s.lecture_id);
        schedulePush(supabase);
        revalidatePath("/", "layout");
      }
    }
    await supabase.from("document_submissions").update({ shared: false }).eq("id", submissionId);
    if (s?.lecture_id) revalidatePath(`/lectures/${s.lecture_id}`);
    revalidatePath("/documents");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
