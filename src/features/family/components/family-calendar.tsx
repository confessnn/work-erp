import Link from "next/link";
import { dateLabel, timeLabel } from "@/lib/format";
import { monthGrid } from "@/features/lectures/month-grid";
import { LECTURE_CLS, PERSONS, personOf, type FamilyEvent, type FamilyLecture } from "../types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Item =
  | { kind: "event"; id: string; date: string; start: string | null; end: string | null; title: string; cls: string; who: string; href: string }
  | { kind: "lecture"; id: string; date: string; start: string | null; end: string | null; title: string; cls: string; who: string; href: string | null };

function merge(events: FamilyEvent[], lectures: FamilyLecture[], lectureHref: boolean): Item[] {
  const items: Item[] = [
    ...events.map((e) => ({
      kind: "event" as const,
      id: e.id,
      date: e.event_date,
      start: e.start_time,
      end: e.end_time,
      title: e.title,
      cls: personOf(e.person).cls,
      who: personOf(e.person).label,
      href: `/family/${e.id}`,
    })),
    ...lectures.map((l) => ({
      kind: "lecture" as const,
      id: l.id,
      date: l.lecture_date,
      start: l.start_time,
      end: l.end_time,
      title: l.title,
      cls: LECTURE_CLS,
      who: "강의",
      href: lectureHref ? `/lectures/${l.id}` : null,
    })),
  ];
  // 날짜 → 종일 먼저 → 시작 시간
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));
}

/**
 * 가족 달력. 아빠·엄마·아기·가족 일정을 색으로 나누고, 강의는 회색으로 제목·시간만 보인다.
 * 날짜를 누르면 그날 일정 추가. 접은 폴드처럼 좁은 화면에서는 아래 목록으로 내용을 본다.
 */
export function FamilyCalendar({
  year,
  month,
  events,
  lectures,
  today,
  lectureHref,
}: {
  year: number;
  month: number;
  events: FamilyEvent[];
  lectures: FamilyLecture[];
  today: string;
  lectureHref: boolean;
}) {
  const items = merge(events, lectures, lectureHref);
  const byDate = new Map<string, Item[]>();
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line text-center text-xs font-medium text-muted">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`py-2 ${i === 0 ? "text-danger" : ""}`}>{w}</div>
          ))}
        </div>
        {monthGrid(year, month).map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map((c, di) =>
              !c ? (
                <div key={`e${wi}-${di}`} className="min-h-16 border-r border-line bg-bg last:border-r-0 sm:min-h-24" />
              ) : (
                <div key={c.date} className="min-h-16 min-w-0 border-r border-line p-0.5 last:border-r-0 sm:min-h-24 sm:p-1.5">
                  <Link
                    href={`/family/new?date=${c.date}`}
                    aria-label={`${c.day}일에 일정 추가`}
                    className="mb-0.5 flex justify-center sm:justify-start"
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums hover:bg-accent-soft ${
                        c.date === today ? "bg-accent font-semibold text-white hover:bg-accent" : di === 0 ? "text-danger" : ""
                      }`}
                    >
                      {c.day}
                    </span>
                  </Link>
                  <ul className="space-y-0.5">
                    {(byDate.get(c.date) ?? []).map((it) => {
                      const cls = `block overflow-hidden whitespace-nowrap rounded-md px-1 py-0.5 text-[11px] leading-tight sm:text-ellipsis sm:text-xs ${it.cls}`;
                      const label = (
                        <>
                          {it.start && <span className="hidden tabular-nums sm:inline">{timeLabel(it.start)} </span>}
                          {it.title}
                        </>
                      );
                      return (
                        <li key={`${it.kind}-${it.id}`}>
                          {it.href ? (
                            <Link href={it.href} title={`${it.who} · ${it.title}`} className={`${cls} hover:opacity-80`}>
                              {label}
                            </Link>
                          ) : (
                            <span title={`${it.who} · ${it.title}`} className={cls}>{label}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {PERSONS.map((p) => (
          <span key={p.v} className="flex items-center gap-1"><i className={`h-3 w-3 rounded ${p.cls}`} />{p.label}</span>
        ))}
        <span className="flex items-center gap-1"><i className={`h-3 w-3 rounded ${LECTURE_CLS}`} />강의</span>
      </div>

      <section className="space-y-2">
        <h2 className="section-title">{month}월 일정 목록</h2>
        {items.length === 0 ? (
          <p className="card text-center text-sm text-muted">이번 달 일정이 없어요. 달력의 날짜를 눌러 추가해 보세요.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it) => {
              const body = (
                <>
                  <span className="w-20 shrink-0 text-sm">
                    <span className={`font-semibold ${it.date === today ? "underline" : ""}`}>{dateLabel(it.date)}</span>
                    <span className="block text-xs text-muted tabular-nums">
                      {it.start ? `${timeLabel(it.start)}${it.end ? `–${timeLabel(it.end)}` : ""}` : "종일"}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${it.cls}`}>{it.who}</span>
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                </>
              );
              const rowCls = "card flex items-center gap-3 px-4 py-2.5";
              return (
                <li key={`${it.kind}-${it.id}`}>
                  {it.href ? (
                    <Link href={it.href} className={`${rowCls} hover:bg-accent-soft`}>{body}</Link>
                  ) : (
                    <div className={rowCls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
