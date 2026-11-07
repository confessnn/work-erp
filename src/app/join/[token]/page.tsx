import type { Metadata } from "next";
import { LoginForm } from "@/app/login/login-form";
import { AcceptInviteForm } from "@/features/family/components/accept-invite";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "가족 초대 · work-erp",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** 가족 초대 링크 (로그인 없이 열림). 로그인하면 바로 참여, 아니면 가입·로그인 후 참여. */
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: info }, { data: claims }] = await Promise.all([
    /^[0-9a-f]{48}$/.test(token)
      ? supabase.rpc("family_invite_info", { p_token: token }).maybeSingle<{ label: string; valid: boolean }>()
      : Promise.resolve({ data: null }),
    supabase.auth.getClaims(),
  ]);
  const loggedIn = Boolean(claims?.claims?.sub);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="page-title mb-1">가족 달력 초대</h1>
        {info?.valid ? (
          <p className="text-sm text-muted">
            <b>{info.label}</b>님으로 초대받았어요. 가족 일정을 함께 보고 입력할 수 있어요.
          </p>
        ) : (
          <p className="text-sm text-danger">
            {info ? "이미 사용했거나 기간이 지난 초대 링크예요." : "초대 링크가 올바르지 않아요."} 새 링크를 보내 달라고 해 주세요.
          </p>
        )}
      </div>

      {info?.valid &&
        (loggedIn ? (
          <AcceptInviteForm token={token} />
        ) : (
          <>
            <p className="text-sm">
              먼저 <b>본인 이메일</b>로 로그인하거나 가입해 주세요. 가입했다면 확인 메일의 링크를 누른 뒤, 이 초대 링크를 다시 열어 주세요.
            </p>
            <LoginForm next={`/join/${token}`} />
          </>
        ))}
    </main>
  );
}
