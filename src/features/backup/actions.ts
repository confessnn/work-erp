"use server";

import { revalidatePath } from "next/cache";
import { getFamilyRole } from "@/features/family/queries";
import { driveContext, failResult } from "@/features/google-drive/context";
import { backupSummary } from "./backup";
import { saveBackup } from "./drive";

type Result = { ok: true; name: string; link: string | null; summary: string } | { ok: false; error: string };

/** 설정 화면 '지금 백업하기' (대표 계정만). 기록을 JSON 하나로 모아 드라이브 work-erp/백업/<YYYY-MM> 에 저장 */
export async function backupNow(): Promise<Result> {
  try {
    if ((await getFamilyRole()).role !== "owner") return { ok: false, error: "대표 계정만 백업할 수 있어요." };
    const ctx = await driveContext();
    const { data, error } = await ctx.supabase.rpc("my_backup");
    if (error) return { ok: false, error: `기록을 읽지 못했어요: ${error.message}` };
    const r = await saveBackup(ctx.token, ctx.folders.docs, data);
    revalidatePath("/settings");
    return { ok: true, name: r.name, link: r.link, summary: `${r.folder} · ${backupSummary(r.counts)}` };
  } catch (e) {
    return failResult(e);
  }
}
