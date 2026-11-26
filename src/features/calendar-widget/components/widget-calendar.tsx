"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { monthGrid } from "@/features/lectures/month-grid";
import { dateLabel, timeLabel } from "@/lib/format";
import { shortHoliday, type Holidays } from "@/lib/holiday-label";
import { addDays, groupByDate, weekOf, yearMonthOf, type WidgetItem } from "../items";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 목록 왼쪽의 시간 (종일 일정은 "종일") */
const Clock = ({ start, end }: { start: string | null; end: string | null }) => (
  <span className="w-24 shrink-0 text-xs text-muted tabular-nums">
    {start ? `${timeLabel(start)}${end ? `–${timeLabel(end)}` : ""}` : "종일"}
  </span>
);

/** 그달의 d일로 가는 주소 */
const href = (date: string) => {
  const { year, month } = yearMonthOf(date);
  return `/calendar/widget?y=${year}&m=${month}&d=${date}`;
};

/**
 * 홈 화면용 달력 (크롬 없는 전체화면). 보이는 내용은 가족 달력과 같다 — 제목·시간뿐, 금액 없음.
 *
 * 화면 모양에 따라 레이아웃을 바꾼다 (해상도를 넘겨받지 않고 CSS 미디어쿼리로만 판단하므로
 * 폴드를 접었다 펼칠 때 다시 불러오지 않아도 바뀐다):
 * - 좁고 길쭉할 때(커버 화면): 주간 띠 + 고른 날 일정 목록
 * - 넓고 정사각에 가까울 때(펼친 내화면): 월간 그리드가 화면을 꽉 채우고 아래에 고른 날 목록
 *
 * 'wide' 변형은 globals.css의 @custom-variant 에 있다.
 */
export function WidgetCalendar({
  year,
  month,
  today,
  items,
  selected: initial,
  holidays = {},
}: {
  year: number;
  month: number;
  today: string;
  items: WidgetItem[];
  /** 처음 고른 날 (주소의 d=) */
  selected: string;
  holidays?: Holidays;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(initial);
  const byDate = groupByDate(items);

  // 보고 있는 달 안이면 바로 바꾸고, 다른 달이면 그 달을 새로 불러온다
  const pick = (date: string) => {
    const ym = yearMonthOf(date);
    if (ym.year === year && ym.month === month) setSelected(date);
    else router.push(href(date));
  };

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const monthHref = (p: { y: number; m: number }) => `/calendar/widget?y=${p.y}&m=${p.m}`;
  const dayItems = byDate.get(selected) ?? [];
  // 커버 화면은 길쭉해서 고른 날 아래가 남는다. 그 자리에 이달 남은 일정을 이어 보여 준다
  const rest = items.filter((it) => it.date > selected);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
      <header className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        <Link href={monthHref(prev)} prefetch={false} aria-label="이전 달" className="btn-ghost h-9 w-9 text-base">‹</Link>
        <span className="min-w-26 text-center text-base font-bold tabular-nums">{year}년 {month}월</span>
        <Link href={monthHref(next)} prefetch={false} aria-label="다음 달" className="btn-ghost h-9 w-9 text-base">›</Link>
        <button type="button" onClick={() => pick(today)} className="chip ml-auto px-3 py-1 text-xs">오늘</button>
        <Link href="/lectures" prefetch={false} className="chip px-3 py-1 text-xs">ERP</Link>
      </header>

      {/* 커버 화면(좁고 길쭉): 주간 띠 */}
      <div className="flex shrink-0 items-center gap-1 px-2 pb-1 wide:hidden">
        <button type="button" onClick={() => pick(addDays(selected, -7))} aria-label="이전 주" className="btn-ghost h-9 w-9 shrink-0 text-base">‹</button>
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
          {weekOf(selected).map((date, i) => {
            const day = Number(date.slice(8));
            const inMonth = date.startsWith(`${year}-${String(month).padStart(2, "0")}-`);
            const of = byDate.get(date) ?? [];
            return (
              <button
                key={date}
                type="button"
                onClick={() => pick(date)}
                aria-pressed={date === selected}
                aria-label={`${date} 일정 보기`}
                className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl border px-0.5 py-1.5 ${
                  date === selected ? "border-accent bg-accent-soft font-semibold" : "border-transparent"
                } ${inMonth ? "" : "opacity-45"}`}
              >
                <span className={`text-[10px] leading-none ${i === 0 || holidays[date] ? "text-danger" : "text-muted"}`}>{WEEKDAYS[i]}</span>
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums ${
                    date === today ? "bg-accent font-semibold text-white" : i === 0 || holidays[date] ? "text-danger" : ""
                  }`}
                >
                  {day}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {of.slice(0, 3).map((it) => (
                    <i key={it.key} className={`h-1.5 w-1.5 rounded-full ${it.cls}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => pick(addDays(selected, 7))} aria-label="다음 주" className="btn-ghost h-9 w-9 shrink-0 text-base">›</button>
      </div>

      {/* 펼친 내화면(넓고 정사각에 가까움): 월간 그리드가 남은 높이를 다 쓴다 */}
      <div className="hidden min-h-0 flex-1 flex-col px-2 pb-1 wide:flex">
        <div className="grid shrink-0 grid-cols-7 text-center text-[11px] font-medium text-muted">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`py-1 ${i === 0 ? "text-danger" : ""}`}>{w}</div>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          {monthGrid(year, month).map((week, wi) => (
            <div key={wi} className="grid min-h-0 flex-1 grid-cols-7 border-b border-line last:border-b-0">
              {week.map((c, di) =>
                !c ? (
                  <div key={`e${wi}-${di}`} className="min-w-0 border-r border-line bg-bg last:border-r-0" />
                ) : (
                  <button
                    key={c.date}
                    type="button"
                    onClick={() => pick(c.date)}
                    aria-pressed={c.date === selected}
                    aria-label={`${c.date} 일정 보기`}
                    className={`flex min-h-0 min-w-0 flex-col items-stretch overflow-hidden border-r border-line p-0.5 text-left last:border-r-0 ${
                      c.date === selected ? "bg-accent-soft" : ""
                    }`}
                  >
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums ${
                          c.date === today ? "bg-accent font-semibold text-white" : di === 0 || holidays[c.date] ? "text-danger" : ""
                        }`}
                      >
                        {c.day}
                      </span>
                      {holidays[c.date] && (
                        <span className="min-w-0 truncate text-[10px] leading-tight text-danger">{shortHoliday(holidays[c.date])}</span>
                      )}
                    </span>
                    <span className="mt-0.5 flex min-h-0 flex-col gap-0.5 overflow-hidden">
                      {(byDate.get(c.date) ?? []).map((it) => (
                        <span
                          key={it.key}
                          title={`${it.who} · ${it.title}`}
                          className={`block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-1 py-0.5 text-[11px] leading-tight ${it.cls}`}
                        >
                          {it.start && <span className="tabular-nums">{timeLabel(it.start)} </span>}
                          {it.title}
                        </span>
                      ))}
                    </span>
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 고른 날 일정 목록 (두 레이아웃 공통) */}
      <section className="flex shrink-0 flex-col gap-1 px-3">
        <h1 className="flex shrink-0 items-baseline gap-2 pt-1">
          <span className="text-sm font-bold">{dateLabel(selected)}</span>
          {holidays[selected] && <span className="text-xs text-danger">{holidays[selected]}</span>}
          <span className="ml-auto text-xs text-muted">{dayItems.length > 0 ? `${dayItems.length}건` : ""}</span>
        </h1>
        {dayItems.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-3 py-3 text-center text-sm text-muted">일정이 없어요.</p>
        ) : (
          <ul className="max-h-[34dvh] space-y-1 overflow-y-auto">
            {dayItems.map((it) => (
              <li key={it.key} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                <Clock start={it.start} end={it.end} />
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${it.cls}`}>{it.who}</span>
                <span className="min-w-0 flex-1 text-sm">{it.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 커버 화면에서만: 고른 날 뒤로 이달에 남은 일정 (길쭉한 화면의 남는 자리) */}
      <section className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-2 wide:hidden">
        {rest.length > 0 && (
          <>
            <h2 className="pb-1 text-xs font-semibold text-muted">이달 남은 일정</h2>
            <ul className="space-y-1">
              {rest.map((it) => (
                <li key={it.key} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => pick(it.date)}
                    className="w-16 shrink-0 text-left text-xs font-medium text-muted"
                  >
                    {dateLabel(it.date)}
                  </button>
                  <Clock start={it.start} end={it.end} />
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${it.cls}`}>{it.who}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
