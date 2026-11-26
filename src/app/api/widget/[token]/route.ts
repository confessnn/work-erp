import { getWidgetFeed } from "@/features/home-widget/queries";

/**
 * 안드로이드 홈 화면 위젯이 읽는 일정 피드 (로그인 없음, 금액 정보 없음).
 * 토큰은 비밀번호처럼 다룬다 — 검색에 잡히지 않게 하고 캐시도 공유하지 않는다.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/widget/[token]">) {
  const { token } = await params;
  const feed = await getWidgetFeed(token);
  if (!feed) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });

  return new Response(JSON.stringify(feed), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, max-age=60",
      "x-robots-tag": "noindex",
    },
  });
}
