import Link from "next/link";
import { timeLabel } from "@/lib/format";
import { monthGrid } from "../month-grid";
import type { Lecture } from "../types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 한 달 달력. 일정을 누르면 수정 화면으로 간다. */
export function LectureCalendar({
  year,
  month,
  lectures,
  today,
}: {
  year: number;
  month: number;
  lectures: Lecture[];
  today: string;
}) {
  const byDate = new Map<string, Lecture[]>();
  for (const l of lectures) byDate.set(l.lecture_date, [...(byDate.get(l.lecture_date) ?? []), l]);

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line text-center text-xs font-medium text-muted">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`py-2 ${i === 0 ? "text-danger" : ""}`}>{w}</div>
          ))}
        </div>
        {monthGrid(year, month).map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map((c, di) => (
              <div
                key={c?.date ?? `e${wi}-${di}`}
                className={`min-h-20 min-w-0 border-r border-line p-0.5 last:border-r-0 sm:min-h-28 sm:p-1.5 ${c ? "" : "bg-bg"}`}
              >
                {c && (
                  <>
                    <div className="mb-0.5 flex justify-center sm:justify-start">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                          c.date === today ? "bg-accent font-semibold text-white" : di === 0 ? "text-danger" : ""
                        }`}
                      >
                        {c.day}
                      </span>
                    </div>
                    <ul className="space-y-0.5">
                      {(byDate.get(c.date) ?? []).map((l) => (
                        <li key={l.id}>
                          <Link
                            href={`/lectures/${l.id}`}
                            title={`${timeLabel(l.start_time)} ${l.title}`.trim()}
                            className={`block overflow-hidden whitespace-nowrap rounded-md sm:text-ellipsis px-1 py-0.5 text-[11px] leading-tight hover:opacity-80 sm:text-xs ${
                              l.is_paid ? "bg-mint/50" : "bg-peach/45"
                            }`}
                          >
                            {l.start_time && (
                              <span className="hidden tabular-nums sm:inline">{timeLabel(l.start_time)} </span>
                            )}
                            {l.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-xs text-muted">
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-peach/45" />미수령</span>
        <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-mint/50" />수령</span>
      </div>
    </div>
  );
}
