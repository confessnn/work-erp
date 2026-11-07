"use client";

import { useOptimistic, useTransition } from "react";
import { setReminder } from "../actions";
import type { ReminderTarget } from "../keys";

/** 일정 하나의 '1시간 전 알림' 켜기/끄기 (종일 일정은 당일 오전 8시) */
export function ReminderBell({ target, on, allDay, withLabel = false }: { target: ReminderTarget; on: boolean; allDay: boolean; withLabel?: boolean }) {
  const [shown, setShown] = useOptimistic(on);
  const [pending, start] = useTransition();
  const when = allDay ? "당일 오전 8시" : "1시간 전";
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={shown ? `${when} 알림 끄기` : `${when} 알림 켜기`}
      title={shown ? `${when} 알림 켜짐 (누르면 끄기)` : `${when} 알림 받기`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setShown(!shown);
          await setReminder(target, !shown);
        })
      }
      className={`inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-full text-base ${
        shown ? "bg-ochre/60" : "text-muted opacity-60 hover:opacity-100"
      } ${withLabel ? "px-3 text-sm" : ""}`}
    >
      <span aria-hidden>{shown ? "🔔" : "🔕"}</span>
      {withLabel && <span>{shown ? `${when} 알림 켜짐` : `${when} 알림 받기`}</span>}
    </button>
  );
}
