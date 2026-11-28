import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// manifest.webmanifest: 홈 화면 앱 설정은 로그인 전에도 읽혀야 한다
// /sw.js: 알림용 서비스 워커는 로그인 화면에서도 받아져야 한다
// /calendar/manifest.webmanifest: 달력만 여는 홈 화면 앱 설정. 역시 로그인 전에도 읽혀야 한다
//   (달력 화면 /calendar/widget 자체는 공개 경로가 아니라 비로그인이면 /login 으로 간다)
// /api/widget: 홈 화면 위젯이 읽는 일정 피드. 위젯은 로그인할 수 없고 비밀 토큰으로만 연다
// /join: 가족 초대 링크. 로그인 전에도 열려야 가입·로그인 안내를 보여 줄 수 있다
// /api/telegram/webhook: 텔레그램 서버가 부른다. 비밀 헤더 확인은 그 경로에서 한다
// /api/lab: 맥에서 도는 연구소 워커가 부른다. 로그인 세션이 없으므로 여기서 막으면 /login 으로 307 된다.
//   확인은 그 경로에서 워커 전용 비밀값(DB 함수 cron_lab_check)으로 한다.
//   화면 /lab 은 공개가 아니다 — 아래 isPublicPath 가 경로 전체나 "/" 로 이어지는 것만 보기 때문이다
const PUBLIC_PATHS = ["/login", "/auth", "/share", "/api/cron", "/api/lab", "/api/telegram/webhook", "/api/widget", "/about", "/privacy", "/manifest.webmanifest", "/calendar/manifest.webmanifest", "/join", "/sw.js"];

/** 로그인 없이 열리는 경로인지. 경로가 그 자체이거나 그 아래(`/`로 이어지는 것)일 때만 공개다 */
export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/** 요청마다 Supabase 세션을 갱신하고, 로그인하지 않았으면 /login으로 보낸다. */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // 화면(layout)이 현재 경로를 알 수 있도록 요청 헤더로 넘긴다 (공고 열람자를 공고 화면으로 보낼 때 사용).
  // request.headers 는 세션 쿠키 갱신(request.cookies.set)이 반영된 뒤에 복사해야 한다.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", path);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = next();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);
  const isPublic = isPublicPath(path);

  if (!loggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (loggedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
