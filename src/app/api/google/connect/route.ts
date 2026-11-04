import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl, isGoogleConfigured } from "@/features/google-calendar/google-api";
import { requireUser } from "@/lib/supabase/server";

/** '구글 캘린더 연결' 버튼 → 구글 로그인/동의 화면으로 보냄 */
export async function GET(request: NextRequest) {
  await requireUser();
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/integrations?google=not_configured", request.url));
  }
  const state = randomBytes(24).toString("hex");
  (await cookies()).set("google_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  const redirectUri = new URL("/api/google/callback", request.url).toString();
  return NextResponse.redirect(authUrl(redirectUri, state));
}
