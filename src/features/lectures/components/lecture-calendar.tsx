"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { timeLabel, won } from "@/lib/format";
import { markPaidMany } from "../actions";
import { monthGrid } from "../month-grid";
import { datesLabel, unpaidOnDates } from "../paid-selection";
import type { Lecture } from "../types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 한 달 달력. 평소에는 일정을 누르면 수정 화면으로 가고,
 * `수령 체크`를 켜면 날짜를 눌러 여러 날을 고른 뒤 한 번에 수령 처리한다.
 */
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
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const byDate = new Map<string, Lecture[]>();
  for (const l of lectures) byDate.set(l.lecture_date, [...(byDate.get(l.lecture_date) ?? []), l]);
  const { ids, total } = unpaidOnDates(lectures, picked);

  const toggle = (date: string) => {
    if (!byDate.has(date)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };
  const stop = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const submit = () =>
    start(async () => {
      const r = await markPaidMany(ids);
      if (r.error) setMsg({ ok: false, text: r.error });
      else {
        setMsg({ ok: true, text: `${r.count}건을 수령으로 체크했어요.` });
        stop();
      }
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {selecting ? (
          <span className="font-medium">수령한 날짜를 눌러 고르세요. 다시 누르면 빠져요.</span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMsg(null);
              setSelecting(true);
            }}
            className="chip"
          >
            ✓ 수령 체크
          </button>
        )}
        {msg && <span className={msg.ok ? "text-success" : "text-danger"}>{msg.text}</span>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line text-center text-xs font-medium text-muted">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`py-2 ${i === 0 ? "text-danger" : ""}`}>{w}</div>
          ))}
        </div>
        {monthGrid(year, month).map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-line last:border-b-0">
            {week.map((c, di) => {
              if (!c) return <div key={`e${wi}-${di}`} className="min-h-20 border-r border-line bg-bg last:border-r-0 sm:min-h-28" />;
              const items = byDate.get(c.date) ?? [];
              const on = picked.has(c.date);
              const pickable = selecting && items.length > 0;
              return (
                <div
                  key={c.date}
                  role={pickable ? "button" : undefined}
                  tabIndex={pickable ? 0 : undefined}
                  aria-pressed={pickable ? on : undefined}
                  aria-label={pickable ? `${c.day}일 선택` : undefined}
                  onClick={pickable ? () => toggle(c.date) : undefined}
                  onKeyDown={
                    pickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle(c.date);
                          }
                        }
                      : undefined
                  }
                  className={`min-h-20 min-w-0 border-r border-line p-0.5 last:border-r-0 sm:min-h-28 sm:p-1.5 ${
                    pickable ? "cursor-pointer select-none" : ""
                  } ${on ? "bg-accent-soft outline-2 -outline-offset-2 outline-accent" : ""} ${
                    selecting && !items.length ? "opacity-50" : ""
                  }`}
                >
                  <div className="mb-0.5 flex justify-center sm:justify-start">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                        c.date === today ? "bg-accent font-semibold text-white" : di === 0 ? "text-danger" : ""
                      }`}
                    >
                      {on ? "✓" : c.day}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {items.map((l) => {
                      const cls = `block overflow-hidden whitespace-nowrap rounded-md sm:text-ellipsis px-1 py-0.5 text-[11px] leading-tight sm:text-xs ${
                        l.is_paid ? "bg-mint/50" : "bg-peach/45"
                      }`;
                      const label = (
                        <>
                          {l.start_time && <span className="hidden tabular-nums sm:inline">{timeLabel(l.start_time)} </span>}
                          {l.title}
                        </>
                      );
                      return (
                        <li key={l.id}>
                          {selecting ? (
                            <span className={cls}>{label}</span>
                          ) : (
                            <Link
                              href={`/lectures/${l.id}`}
                              title={`${timeLabel(l.start_time)} ${l.title}`.trim()}
                              className={`${cls} hover:opacity-80`}
                            >
                              {label}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selecting ? (
        <div className="card sticky bottom-3 z-10 space-y-3 shadow-lg">
          <div className="text-sm">
            {picked.size === 0 ? (
              <span className="text-muted">아직 고른 날짜가 없어요.</span>
            ) : (
              <>
                <div className="font-medium">{datesLabel(picked)}</div>
                <div className="text-muted">
                  미수령 {ids.length}건 · 예상 수령 {won(total)}
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={pending || ids.length === 0} className="btn-primary flex-1">
              {pending ? "처리 중…" : `${ids.length}건 수령으로 체크`}
            </button>
            <button type="button" onClick={stop} disabled={pending} className="chip">
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-peach/45" />미수령</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-mint/50" />수령</span>
        </div>
      )}
    </div>
  );
}
