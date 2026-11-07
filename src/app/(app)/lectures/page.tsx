import Link from "next/link";
import { parsePeriod, PeriodNav } from "@/components/period-nav";
import { summarize } from "@/features/dashboard/summary";
import { LectureCalendar } from "@/features/lectures/components/lecture-calendar";
import { LectureTable } from "@/features/lectures/components/lecture-table";
import { listLectures } from "@/features/lectures/queries";
import { nowInSeoul, todayInSeoul, won } from "@/lib/format";

const STATUS = [
  { v: undefined, label: "전체" },
  { v: "unpaid", label: "미수령" },
  { v: "paid", label: "수령" },
] as const;

export default async function LecturesPage({ searchParams }: PageProps<"/lectures">) {
  const sp = await searchParams;
  const now = nowInSeoul();
  const period = parsePeriod(sp, now);
  const status = sp.status === "paid" || sp.status === "unpaid" ? sp.status : undefined;
  // 달력은 한 달 단위로만 보여 준다. 연도별에서는 목록으로 둔다.
  const calendar = sp.view === "calendar" && period.month !== undefined;
  const lectures = await listLectures(period, { status });
  const s = summarize(lectures);

  const q = (p: { st?: string; view?: string; month?: number }) => {
    const month = "month" in p ? p.month : period.month;
    const params = new URLSearchParams({ y: String(period.year), m: month ? String(month) : "all" });
    if (p.st) params.set("status", p.st);
    if (p.view) params.set("view", p.view);
    return `/lectures?${params}`;
  };
  const view = calendar ? "calendar" : undefined;
  const calendarMonth = period.month ?? (period.year === now.year ? now.month : 1);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">일정</h1>
        <div className="flex gap-2">
          <Link href="/lectures/import" className="chip self-center">캘린더에서 불러오기</Link>
          <Link href="/lectures/new" className="btn-primary">+ 일정 추가</Link>
        </div>
      </div>

      <PeriodNav base="/lectures" period={period} extra={{ status, view }} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-full border border-line bg-surface p-0.5">
          <Link
            href={q({ st: status })}
            className={`rounded-full px-4 py-1.5 ${calendar ? "text-muted" : "bg-accent-soft font-semibold"}`}
          >
            목록
          </Link>
          <Link
            href={q({ st: status, view: "calendar", month: calendarMonth })}
            className={`rounded-full px-4 py-1.5 ${calendar ? "bg-accent-soft font-semibold" : "text-muted"}`}
          >
            달력
          </Link>
        </div>
        {STATUS.map((x) => (
          <Link key={x.label} href={q({ st: x.v, view })} className={`chip ${status === x.v ? "chip-on" : ""}`}>
            {x.label}
          </Link>
        ))}
        <span className="ml-auto text-muted">
          {s.count}건 · 예상 {won(s.expectedNet)}
        </span>
      </div>

      {calendar ? (
        <LectureCalendar year={period.year} month={period.month!} lectures={lectures} today={todayInSeoul()} />
      ) : (
        <LectureTable lectures={lectures} />
      )}
    </>
  );
}
