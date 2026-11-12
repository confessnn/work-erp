import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// manifest.webmanifest: 홈 화면 앱 설정은 로그인 전에도 읽혀야 한다
// /sw.js: 알림용 서비스 워커는 로그인 화면에서도 받아져야 한다
// /join: 가족 초대 링크. 로그인 전에도 열려야 가입·로그인 안내를 보여 줄 수 있다
const PUBLIC_PATHS = ["/login", "/auth", "/share", "/api/cron", "/about", "/privacy", "/manifest.webmanifest", "/join", "/sw.js"];

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
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

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
