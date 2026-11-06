import Link from "next/link";
import { parsePeriod, PeriodNav } from "@/components/period-nav";
import { ApiCreditsSection } from "@/features/api-credits/components/api-credits-section";
import { summarize, summarizeByMonth } from "@/features/dashboard/summary";
import { LectureTable } from "@/features/lectures/components/lecture-table";
import { listLectures, listUpcoming } from "@/features/lectures/queries";
import { flushPendingGoogleDeletes } from "@/features/google-calendar/push";
import { requireUser } from "@/lib/supabase/server";
import { hoursLabel, nowInSeoul, won } from "@/lib/format";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const period = parsePeriod(await searchParams, nowInSeoul());
  const [lectures, upcoming, { supabase }] = await Promise.all([listLectures(period), listUpcoming(), requireUser()]);
  await flushPendingGoogleDeletes(supabase);
  const s = summarize(lectures);
  const diff = s.receivedTotal - s.receivedExpected;

  const byType = (["business", "other"] as const).map((t) => ({
    t,
    s: summarize(lectures.filter((l) => l.income_type === t)),
  }));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <Link href="/lectures/new" className="btn-primary">+ 일정 추가</Link>
      </div>

      <PeriodNav base="/" period={period} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="총 강의료 (세전)" value={won(s.grossTotal)} sub={`${s.count}건 · ${hoursLabel(s.totalHours)}`} />
        <Stat label="예상 수령액 (세후)" value={won(s.expectedNet)} sub={`원천징수 ${won(s.taxTotal)}`} />
        <Stat
          label="수령한 금액"
          value={won(s.receivedTotal)}
          sub={`${s.paidCount}건${diff !== 0 ? ` · 예상 대비 ${diff > 0 ? "+" : ""}${won(diff)}` : ""}`}
          tone="success"
        />
        <Stat label="미수령 금액" value={won(s.unpaidTotal)} sub={`${s.unpaidCount}건`} tone="warn" />
      </section>

      {s.expectedNet > 0 && (
        <section className="card space-y-2">
          <div className="flex justify-between text-sm">
            <span>수령 진행률</span>
            <span className="tabular-nums">{Math.round((s.receivedExpected / s.expectedNet) * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-success" style={{ width: `${(s.receivedExpected / s.expectedNet) * 100}%` }} />
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="section-title mb-3">소득 구분별</h2>
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr><th className="text-left font-normal">구분</th><th className="num">세전</th><th className="num">원천징수</th><th className="num">예상 수령</th><th className="num">미수령</th></tr>
          </thead>
          <tbody>
            {byType.map(({ t, s }) => (
              <tr key={t} className="border-t border-line">
                <td className="py-2">{t === "business" ? "사업소득 3.3%" : "기타소득 8.8%"}</td>
                <td className="num">{won(s.grossTotal)}</td>
                <td className="num">{won(s.taxTotal)}</td>
                <td className="num">{won(s.expectedNet)}</td>
                <td className="num">{won(s.unpaidTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!period.month && (
        <section className="card overflow-x-auto">
          <h2 className="section-title mb-3">월별</h2>
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-muted">
              <tr><th className="text-left font-normal">월</th><th className="num">건수</th><th className="num">세전</th><th className="num">예상 수령</th><th className="num">수령</th><th className="num">미수령</th></tr>
            </thead>
            <tbody>
              {summarizeByMonth(lectures).map(({ month, summary: m }) => (
                <tr key={month} className={`border-t border-line ${m.count ? "" : "text-muted"}`}>
                  <td className="py-2">
                    <Link href={`/?y=${period.year}&m=${month}`} className="hover:underline">{month}월</Link>
                  </td>
                  <td className="num">{m.count}</td>
                  <td className="num">{won(m.grossTotal)}</td>
                  <td className="num">{won(m.expectedNet)}</td>
                  <td className="num">{won(m.receivedTotal)}</td>
                  <td className="num">{won(m.unpaidTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <ApiCreditsSection />

      <section className="space-y-3">
        <h2 className="section-title">다가오는 일정</h2>
        <LectureTable lectures={upcoming} />
      </section>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "warn" }) {
  const color = tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="card">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
