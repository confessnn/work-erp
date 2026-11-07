import Link from "next/link";
import { after } from "next/server";
import { importFamilySources } from "@/features/family/auto-import";
import { FamilyCalendar } from "@/features/family/components/family-calendar";
import { getFamilyRole, listFamilyMonth } from "@/features/family/queries";
import { PushSetup } from "@/features/reminders/components/push-setup";
import { listMyReminderKeys } from "@/features/reminders/queries";
import { nowInSeoul, todayInSeoul } from "@/lib/format";

export default async function FamilyPage({ searchParams }: PageProps<"/family">) {
  const sp = await searchParams;
  const now = nowInSeoul();
  const y = Number(sp.y);
  const m = Number(sp.m);
  const year = Number.isInteger(y) && y > 2000 && y < 2100 ? y : now.year;
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : now.month;
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const [role, { events, lectures }, reminderKeys] = await Promise.all([
    getFamilyRole(),
    listFamilyMonth(year, month),
    listMyReminderKeys(),
  ]);
  // 응답을 보낸 뒤, 30분 넘게 안 가져온 가족 구글 캘린더를 가져온다 (다음에 열 때 반영)
  after(() => importFamilySources({ familyId: role.role === "member" ? role.ownerId : role.userId, staleOnly: true }).catch(() => {}));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">가족 달력</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/family/calendars" className="chip self-center">구글 캘린더 연결</Link>
          {role.role === "owner" && (
            <Link href="/family/settings" className="chip self-center">가족 초대</Link>
          )}
          <Link href="/family/new" className="btn-primary">+ 일정 추가</Link>
        </div>
      </div>

      <PushSetup />

      <div className="flex items-center gap-2">
        <Link href={`/family?y=${prev.y}&m=${prev.m}`} className="btn-ghost" aria-label="이전 달">‹</Link>
        <span className="min-w-28 text-center text-lg font-semibold">{year}년 {month}월</span>
        <Link href={`/family?y=${next.y}&m=${next.m}`} className="btn-ghost" aria-label="다음 달">›</Link>
        {(year !== now.year || month !== now.month) && (
          <Link href="/family" className="ml-auto text-sm text-muted hover:underline">이번 달</Link>
        )}
      </div>

      <FamilyCalendar
        year={year}
        month={month}
        events={events}
        lectures={lectures}
        today={todayInSeoul()}
        lectureHref={role.role === "owner"}
        reminderKeys={reminderKeys}
      />
    </>
  );
}
