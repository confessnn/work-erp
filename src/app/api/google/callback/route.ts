import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret } from "@/features/google-calendar/crypto";
import { exchangeCode } from "@/features/google-calendar/google-api";
import { pushToGoogle } from "@/features/google-calendar/push";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

/** 구글 동의 후 돌아오는 곳: refresh token 을 암호화해 저장하고 기존 일정을 한 번 올린다 */
export async function GET(request: NextRequest) {
  const { supabase, userId } = await requireUser();
  const back = (q: string) => NextResponse.redirect(new URL(`/integrations?google=${q}`, request.url));

  const jar = await cookies();
  const expected = jar.get("google_oauth_state")?.value ?? "";
  jar.delete({ name: "google_oauth_state", path: "/api/google" });

  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state") ?? "";
  if (
    !expected ||
    expected.length !== state.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(state))
  ) {
    return back("state_mismatch");
  }
  if (searchParams.get("error")) return back("denied");

  const code = searchParams.get("code");
  if (!code) return back("denied");

  try {
    const redirectUri = new URL("/api/google/callback", request.url).toString();
    const { refreshToken, email } = await exchangeCode(code, redirectUri);
    const { error } = await supabase.from("google_connections").upsert({
      user_id: userId,
      google_email: email,
      refresh_token_enc: encryptSecret(refreshToken),
      last_push_result: null,
    });
    if (error) return back("save_failed");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return back(msg.includes("권한") ? "scope_missing" : "token_failed");
  }

  // 처음 연결 시 기존 일정 전부 올리기 (캘린더도 이때 생성)
  await pushToGoogle(supabase, { force: true });
  return back("connected");
}
