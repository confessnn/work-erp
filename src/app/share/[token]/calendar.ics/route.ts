import { buildIcsFeed } from "@/features/share/feed";
import { getSharedSchedule } from "@/features/share/queries";

/** 휴대폰 캘린더 구독용 iCal 피드 (로그인 없음, 금액 정보 없음) */
export async function GET(_req: Request, { params }: RouteContext<"/share/[token]/calendar.ics">) {
  const { token } = await params;
  const shared = await getSharedSchedule(token);
  if (!shared) return new Response("Not found", { status: 404 });

  return new Response(buildIcsFeed(shared.events, "강의 일정"), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="lectures.ics"',
      "cache-control": "private, max-age=300",
      "x-robots-tag": "noindex",
    },
  });
}
