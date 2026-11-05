"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createFolder, folderUsable, getFile, trashFile } from "@/features/documents/drive";
import { driveContext, failResult } from "@/features/google-drive/context";
import { GoogleApiError } from "@/features/google-calendar/google-api";
import { monthKey } from "./age";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function saveBabyInfo(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const name = String(fd.get("baby_name") ?? "").trim().slice(0, 30) || null;
  const birth = String(fd.get("baby_birth_date") ?? "");
  await supabase.from("user_settings").upsert({
    user_id: userId,
    baby_name: name,
    baby_birth_date: isDate(birth) ? birth : null,
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/baby");
}

type Ctx = Awaited<ReturnType<typeof driveContext>>;

/** work-erp/아기 사진 폴더 (없으면 생성) */
async function babyRoot(ctx: Ctx) {
  if (await folderUsable(ctx.token, ctx.conn.drive_baby_folder_id)) return ctx.conn.drive_baby_folder_id as string;
  const workErpRoot = (await getFile(ctx.token, ctx.folders.docs)).parents?.[0];
  const id = (await createFolder(ctx.token, "아기 사진", workErpRoot)).id;
  await ctx.supabase.from("google_connections").update({ drive_baby_folder_id: id }).eq("user_id", ctx.userId);
  // 최상위가 새로 생겼으면 예전 날짜 폴더 기록은 쓸모없음
  await ctx.supabase.from("baby_folders").delete().eq("user_id", ctx.userId);
  return id;
}

/** 'YYYY-MM' 또는 'YYYY-MM-DD' 폴더 (기록된 폴더가 드라이브에서 지워졌으면 다시 만듦) */
async function folderFor(ctx: Ctx, key: string, parent: string, known: Map<string, string>) {
  const cached = known.get(key);
  if (cached && (await folderUsable(ctx.token, cached))) return cached;
  const id = (await createFolder(ctx.token, key, parent)).id;
  await ctx.supabase.from("baby_folders").upsert({ user_id: ctx.userId, key, folder_id: id });
  known.set(key, id);
  return id;
}

async function dateFolders(ctx: Ctx, dates: string[]) {
  const root = await babyRoot(ctx);
  const { data } = await ctx.supabase.from("baby_folders").select("key, folder_id");
  const known = new Map((data ?? []).map((r) => [r.key as string, r.folder_id as string]));
  const out: Record<string, string> = {};
  for (const date of [...new Set(dates)].sort()) {
    const month = await folderFor(ctx, monthKey(date), root, known);
    out[date] = await folderFor(ctx, date, month, known);
  }
  return out;
}

/**
 * 업로드 준비: 브라우저용 드라이브 토큰(1시간, 앱이 만든 파일만) + 날짜별 폴더 ID.
 * 이미 올린 사진(sha1)은 알려줘서 건너뛰게 한다.
 */
export async function prepareBabyUpload(input: { dates: string[]; sha1s: string[] }): Promise<
  Result<{ token: string; folders: Record<string, string>; existing: string[] }>
> {
  try {
    const dates = input.dates.filter(isDate).slice(0, 400);
    if (!dates.length) return { ok: false, error: "사진 날짜를 확인하지 못했습니다." };
    const ctx = await driveContext();
    const folders = await dateFolders(ctx, dates);
    const sha1s = input.sha1s.filter((s) => /^[0-9a-f]{40}$/.test(s)).slice(0, 1000);
    const { data } = sha1s.length
      ? await ctx.supabase.from("baby_photos").select("sha1").in("sha1", sha1s)
      : { data: [] as { sha1: string }[] };
    return { ok: true, token: ctx.token, folders, existing: (data ?? []).map((r) => r.sha1) };
  } catch (e) {
    return failResult(e);
  }
}

/** 브라우저가 날짜 폴더에 올린 사진을 등록 (서버가 드라이브에서 폴더 위치를 직접 확인) */
export async function registerBabyPhoto(input: {
  driveFileId: string;
  sha1: string;
  takenAt: string | null;
  takenDate: string;
  dateSource: "exif" | "file" | "manual";
  thumb: string | null;
  width: number | null;
  height: number | null;
}): Promise<Result> {
  try {
    if (!isDate(input.takenDate) || !/^[0-9a-f]{40}$/.test(input.sha1)) return { ok: false, error: "사진 정보가 올바르지 않습니다." };
    const { supabase } = await requireUser();
    const { data: folder } = await supabase.from("baby_folders").select("folder_id").eq("key", input.takenDate).maybeSingle();
    const ctx = await driveContext();
    const f = await getFile(ctx.token, input.driveFileId);
    if (!folder || !f.parents?.includes(folder.folder_id)) return { ok: false, error: "날짜 폴더에 올라간 사진이 아닙니다." };

    const thumb = input.thumb?.startsWith("data:image/jpeg;base64,") && input.thumb.length < 120_000 ? input.thumb : null;
    const { error } = await supabase.from("baby_photos").insert({
      drive_file_id: f.id,
      file_name: f.name,
      mime_type: f.mimeType,
      size_bytes: f.size ? Number(f.size) : null,
      sha1: input.sha1,
      taken_at: input.takenAt,
      taken_date: input.takenDate,
      date_source: ["exif", "file", "manual"].includes(input.dateSource) ? input.dateSource : "file",
      thumb,
      width: input.width,
      height: input.height,
    });
    if (error) {
      // 같은 사진이 동시에 올라간 경우: 방금 올린 드라이브 파일은 치운다
      if (error.code === "23505") {
        await trashFile(ctx.token, f.id);
        return { ok: true };
      }
      return { ok: false, error: `저장 실패: ${error.message}` };
    }
    return { ok: true };
  } catch (e) {
    return failResult(e);
  }
}

export async function refreshBabyPage() {
  revalidatePath("/baby");
}

/** 사진 날짜 바꾸기: 드라이브에서도 해당 날짜 폴더로 옮긴다 */
export async function changePhotoDate(id: string, newDate: string): Promise<Result> {
  try {
    if (!isDate(newDate)) return { ok: false, error: "날짜가 올바르지 않습니다." };
    const ctx = await driveContext();
    const { data: p } = await ctx.supabase.from("baby_photos").select("drive_file_id, taken_date").eq("id", id).single();
    if (!p) return { ok: false, error: "사진을 찾지 못했습니다." };
    const folders = await dateFolders(ctx, [newDate]);
    const f = await getFile(ctx.token, p.drive_file_id);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(p.drive_file_id)}?addParents=${folders[newDate]}&removeParents=${(f.parents ?? []).join(",")}&fields=id`,
      { method: "PATCH", headers: { authorization: `Bearer ${ctx.token}`, "content-type": "application/json" }, body: "{}" },
    );
    if (!res.ok) throw new GoogleApiError(res.status, "드라이브에서 사진을 옮기지 못했습니다.");
    await ctx.supabase.from("baby_photos").update({ taken_date: newDate, date_source: "manual" }).eq("id", id);
    revalidatePath("/baby");
    return { ok: true };
  } catch (e) {
    return failResult(e);
  }
}

/** 사진 삭제: 앱 목록에서 지우고 드라이브 파일은 휴지통으로 (30일 안에 복구 가능) */
export async function deleteBabyPhoto(id: string): Promise<Result> {
  try {
    const ctx = await driveContext();
    const { data: p } = await ctx.supabase.from("baby_photos").select("drive_file_id").eq("id", id).single();
    if (p) await trashFile(ctx.token, p.drive_file_id);
    await ctx.supabase.from("baby_photos").delete().eq("id", id);
    revalidatePath("/baby");
    return { ok: true };
  } catch (e) {
    return failResult(e);
  }
}
