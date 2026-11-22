"use server";

import { revalidatePath } from "next/cache";
import { cleanNavPrefs, NAV } from "@/components/nav-items";
import { getFamilyRole } from "@/features/family/queries";
import { requireUser } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; message: string };

/** 상단 메뉴 순서·숨김 저장 (대표 계정만). null 이면 기본으로 되돌리기 */
export async function saveNavPrefs(raw: unknown): Promise<Result> {
  if ((await getFamilyRole()).role !== "owner") return { ok: false, message: "대표 계정만 바꿀 수 있어요." };
  const prefs = raw === null ? null : cleanNavPrefs(NAV, raw);
  if (raw !== null && !prefs) return { ok: false, message: "메뉴 설정이 올바르지 않아요." };
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, nav_prefs: prefs, updated_at: new Date().toISOString() });
  if (error) return { ok: false, message: `저장하지 못했어요: ${error.message}` };
  // 모든 화면의 상단 메뉴가 바뀐다
  revalidatePath("/", "layout");
  return { ok: true };
}
