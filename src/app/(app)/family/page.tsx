import Link from "next/link";
import { FamilyCalendar } from "@/features/family/components/family-calendar";
import { getFamilyRole, listFamilyMonth } from "@/features/family/queries";
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

  const [role, { events, lectures }] = await Promise.all([getFamilyRole(), listFamilyMonth(year, month)]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">가족 달력</h1>
        <div className="flex gap-2">
          {role.role === "owner" && (
            <Link href="/family/settings" className="chip self-center">가족 초대</Link>
          )}
          <Link href="/family/new" className="btn-primary">+ 일정 추가</Link>
        </div>
      </div>

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
      />
    </>
  );
}
