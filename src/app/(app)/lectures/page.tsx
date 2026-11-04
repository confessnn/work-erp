import Link from "next/link";
import { parsePeriod, PeriodNav } from "@/components/period-nav";
import { summarize } from "@/features/dashboard/summary";
import { LectureTable } from "@/features/lectures/components/lecture-table";
import { listLectures } from "@/features/lectures/queries";
import { nowInSeoul, won } from "@/lib/format";

const STATUS = [
  { v: undefined, label: "전체" },
  { v: "unpaid", label: "미수령" },
  { v: "paid", label: "수령" },
] as const;

export default async function LecturesPage({ searchParams }: PageProps<"/lectures">) {
  const sp = await searchParams;
  const period = parsePeriod(sp, nowInSeoul());
  const status = sp.status === "paid" || sp.status === "unpaid" ? sp.status : undefined;
  const lectures = await listLectures(period, { status });
  const s = summarize(lectures);

  const q = (st?: string) => {
    const p = new URLSearchParams({ y: String(period.year), m: period.month ? String(period.month) : "all" });
    if (st) p.set("status", st);
    return `/lectures?${p}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">일정</h1>
        <div className="flex gap-2">
          <Link href="/lectures/import" className="chip self-center">캘린더에서 불러오기</Link>
          <Link href="/lectures/new" className="btn-primary">+ 일정 추가</Link>
        </div>
      </div>

      <PeriodNav base="/lectures" period={period} extra={{ status }} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {STATUS.map((x) => (
          <Link key={x.label} href={q(x.v)} className={`chip ${status === x.v ? "chip-on" : ""}`}>
            {x.label}
          </Link>
        ))}
        <span className="ml-auto text-muted">
          {s.count}건 · 예상 {won(s.expectedNet)}
        </span>
      </div>

      <LectureTable lectures={lectures} />
    </>
  );
}
