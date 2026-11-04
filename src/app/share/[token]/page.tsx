import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedSchedule } from "@/features/share/queries";
import { dateLabel, timeLabel, todayInSeoul } from "@/lib/format";

export const metadata: Metadata = {
  title: "강의 일정",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** 가족 공유 화면 (로그인 없음). 금액 정보는 데이터 자체에 없다. */
export default async function SharedPage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  const shared = await getSharedSchedule(token);
  if (!shared) notFound();

  const today = todayInSeoul();
  const upcoming = shared.events.filter((e) => e.lecture_date >= today);
  const past = shared.events.filter((e) => e.lecture_date < today).reverse();

  const byMonth = new Map<string, typeof upcoming>();
  for (const e of upcoming) {
    const k = e.lecture_date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">강의 일정</h1>
        <p className="text-sm text-muted">{shared.label} · 보기 전용</p>
      </header>

      {upcoming.length === 0 && <p className="card text-center text-muted">예정된 일정이 없습니다.</p>}

      {[...byMonth.entries()].map(([month, items]) => (
        <section key={month} className="space-y-2">
          <h2 className="section-title">{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</h2>
          <ul className="space-y-2">
            {items.map((e) => (
              <EventRow key={e.id} e={e} today={e.lecture_date === today} />
            ))}
          </ul>
        </section>
      ))}

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted">지난 일정 {past.length}개</summary>
          <ul className="mt-2 space-y-2 opacity-70">
            {past.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}

function EventRow({
  e,
  today,
}: {
  e: { title: string; organization: string | null; lecture_date: string; start_time: string | null; end_time: string | null };
  today?: boolean;
}) {
  return (
    <li className={`card flex items-center gap-4 ${today ? "border-accent" : ""}`}>
      <div className="w-24 shrink-0 text-sm">
        <div className="font-semibold">{dateLabel(e.lecture_date)}{today && <span className="ml-1 text-accent">오늘</span>}</div>
        <div className="text-muted">{e.start_time ? `${timeLabel(e.start_time)}–${timeLabel(e.end_time)}` : "종일"}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{e.title}</div>
        {e.organization && <div className="truncate text-sm text-muted">{e.organization}</div>}
      </div>
    </li>
  );
}
