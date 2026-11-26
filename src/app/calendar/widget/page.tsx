import type { Metadata, Viewport } from "next";
import { WidgetCalendar } from "@/features/calendar-widget/components/widget-calendar";
import { widgetItems, selectedDate } from "@/features/calendar-widget/items";
import { listFamilyMonth } from "@/features/family/queries";
import { nowInSeoul, todayInSeoul } from "@/lib/format";
import { holidaysOfMonth } from "@/lib/holidays";

export const metadata: Metadata = {
  title: "달력",
  // 홈 화면에 따로 추가하는 달력 전용 앱 설정 (앱 전체 설정은 app/manifest.ts 그대로)
  manifest: "/calendar/manifest.webmanifest",
  appleWebApp: { capable: true, title: "달력", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 힌지·노치·제스처 바 아래까지 화면을 쓰고, 여백은 safe-area-inset-* 으로 준다
  viewportFit: "cover",
  themeColor: "#f2f2f3",
};

/**
 * 홈 화면에서 한 번 눌러 전체화면으로 여는 달력. 앱 상단 메뉴 없이 달력만 보여 준다.
 *
 * 보이는 범위는 '가족 달력'(초대받은 아내가 보는 화면)과 똑같이 features/family/queries.ts 의
 * listFamilyMonth 하나만 쓴다. 그래서 금액은 들어올 길이 없다:
 * - 강의: DB 함수 family_lecture_schedule 이 제목·기관·날짜·시간 열만 돌려준다 (금액·수령 열 없음)
 * - 가족 일정: family_events 를 RLS(family_id = my_family())가 가족 것만 보여 준다
 * 로그인하지 않으면 proxy.ts 가 /login 으로 보낸다 (이 경로는 공개 경로가 아니다).
 */
export default async function CalendarWidgetPage({ searchParams }: PageProps<"/calendar/widget">) {
  const sp = await searchParams;
  const now = nowInSeoul();
  const y = Number(sp.y);
  const m = Number(sp.m);
  const year = Number.isInteger(y) && y > 2000 && y < 2100 ? y : now.year;
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : now.month;
  const today = todayInSeoul();
  const selected = selectedDate(typeof sp.d === "string" ? sp.d : undefined, year, month, today);

  const [{ events, lectures }, holidays] = await Promise.all([
    listFamilyMonth(year, month),
    holidaysOfMonth(year, month),
  ]);

  return (
    <WidgetCalendar
      year={year}
      month={month}
      today={today}
      items={widgetItems(events, lectures)}
      selected={selected}
      holidays={holidays}
    />
  );
}
