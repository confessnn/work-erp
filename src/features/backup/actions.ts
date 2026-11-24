"use server";

import { revalidatePath } from "next/cache";
import { getFamilyRole } from "@/features/family/queries";
import { requireUser } from "@/lib/supabase/server";
import { driveContext, failResult } from "@/features/google-drive/context";
import { backupSummary } from "./backup";
import { saveBackup } from "./drive";

type Result = { ok: true; name: string; link: string | null; summary: string } | { ok: false; error: string };

/** 설정 화면 '지금 백업하기' (대표 계정만). 기록을 JSON 하나로 모아 드라이브 work-erp/백업/<YYYY-MM> 에 저장 */
export async function backupNow(): Promise<Result> {
  if ((await getFamilyRole()).role !== "owner") return { ok: false, error: "대표 계정만 백업할 수 있어요." };
  const { supabase, userId } = await requireUser();
  // 결과를 남겨 두면 아침 브리핑이 실패·밀림을 알린다 (기록 실패는 백업 결과에 영향 없음)
  const record = (row: { last_ok_at?: string; last_file?: string; last_error?: string; last_error_at?: string }) =>
    supabase.from("backup_status").upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() });
  try {
    const ctx = await driveContext();
    const { data, error } = await ctx.supabase.rpc("my_backup");
    if (error) throw new Error(`기록을 읽지 못했어요: ${error.message}`);
    const r = await saveBackup(ctx.token, ctx.folders.docs, data);
    await record({ last_ok_at: new Date().toISOString(), last_file: `${r.folder}/${r.name}` });
    revalidatePath("/settings");
    return { ok: true, name: r.name, link: r.link, summary: `${r.folder} · ${backupSummary(r.counts)}` };
  } catch (e) {
    const fail = failResult(e);
    await record({ last_error: fail.error.slice(0, 500), last_error_at: new Date().toISOString() });
    revalidatePath("/settings");
    return fail;
  }
}
