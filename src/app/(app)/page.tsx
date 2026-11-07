import Link from "next/link";
import { redirect } from "next/navigation";
import { parsePeriod, PeriodNav } from "@/components/period-nav";
import { getFamilyRole } from "@/features/family/queries";
import { ApiCreditsSection } from "@/features/api-credits/components/api-credits-section";
import { summarize, summarizeByMonth } from "@/features/dashboard/summary";
import { LectureCalendar } from "@/features/lectures/components/lecture-calendar";
import { LectureTable } from "@/features/lectures/components/lecture-table";
import { listLectures, listUpcoming } from "@/features/lectures/queries";
import { flushPendingGoogleDeletes } from "@/features/google-calendar/push";
import { requireUser } from "@/lib/supabase/server";
import { hoursLabel, nowInSeoul, todayInSeoul, won } from "@/lib/format";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  // 초대받은 가족의 첫 화면은 가족 달력
  if ((await getFamilyRole()).role === "member") redirect("/family");
  const now = nowInSeoul();
  const period = parsePeriod(await searchParams, now);
  const [lectures, thisMonth, upcoming, { supabase }] = await Promise.all([
    listLectures(period),
    listLectures(now),
    listUpcoming(),
    requireUser(),
  ]);
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
        <h1 className="page-title">대시보드</h1>
        <Link href="/lectures/new" className="btn-primary">+ 일정 추가</Link>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">{now.month}월 일정</h2>
          <Link href="/lectures?view=calendar" className="text-sm text-muted hover:underline">
            다른 달 보기 ›
          </Link>
        </div>
        <LectureCalendar year={now.year} month={now.month} lectures={thisMonth} today={todayInSeoul()} />
      </section>

      <div className="space-y-2">
        <div className="grid md:grid-cols-2">
          <ApiCreditsSection />
        </div>
        <p className="text-xs text-muted">
          API 잔액과 충전 시점은 입력값에서 사용액을 빼 계산한 추정치이고, 사용액은 UTC 날짜 기준입니다. Claude 사용액은 보통 4시간, 길면 24시간 늦게 반영됩니다. 실제 잔액과 다르면 다시 입력하세요.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="section-title">다가오는 일정</h2>
        <LectureTable lectures={upcoming} />
      </section>

      <h2 className="section-title">강의료</h2>

      <PeriodNav base="/" period={period} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="총 강의료 (세전)" value={won(s.grossTotal)} sub={`${s.count}건 · ${hoursLabel(s.totalHours)}`} tone="lavender" />
        <Stat label="예상 수령액 (세후)" value={won(s.expectedNet)} sub={`원천징수 ${won(s.taxTotal)}`} tone="ochre" />
        <Stat
          label="수령한 금액"
          value={won(s.receivedTotal)}
          sub={`${s.paidCount}건${diff !== 0 ? ` · 예상 대비 ${diff > 0 ? "+" : ""}${won(diff)}` : ""}`}
          tone="mint"
        />
        <Stat label="미수령 금액" value={won(s.unpaidTotal)} sub={`${s.unpaidCount}건`} tone="peach" />
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
    </>
  );
}

const STAT_TONE = { lavender: "bg-lavender", ochre: "bg-ochre", mint: "bg-mint", peach: "bg-peach" };

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: keyof typeof STAT_TONE }) {
  return (
    <div className={`rounded-2xl p-4 sm:p-5 ${STAT_TONE[tone]}`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</div>
      {sub && <div className="mt-1 text-xs">{sub}</div>}
    </div>
  );
}
