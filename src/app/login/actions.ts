"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/features/family/form";

export type AuthState = { error?: string };

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        error.message === "Email not confirmed"
          ? "이메일 인증이 아직 안 됐습니다. 받은 메일의 링크를 눌러주세요."
          : "이메일 또는 비밀번호가 맞지 않습니다.",
    };
  }
  redirect(safeNext(formData.get("next")) ?? "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
