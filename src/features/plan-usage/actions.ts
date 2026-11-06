"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

/** '지금 갱신' 버튼. 값은 PC에서만 읽을 수 있어 요청만 남긴다 (scripts/plan-usage/codex-report.mjs가 확인) */
export async function requestPlanRefresh() {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("plan_usage_refresh")
    .upsert({ user_id: userId, requested_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
