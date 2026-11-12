"use client";

import { useActionState, useState } from "react";
import type { FamilyFormState } from "../actions";
import { PERSONS, type FamilyEvent, type Person } from "../types";

export function FamilyEventForm({
  action,
  event,
  defaultDate,
  defaultPerson,
  submitLabel,
  back,
}: {
  action: (prev: FamilyFormState, fd: FormData) => Promise<FamilyFormState>;
  event?: FamilyEvent;
  defaultDate: string;
  defaultPerson: Person;
  submitLabel: string;
  /** 저장 후 돌아갈 곳: 'lectures' 면 일정 탭 */
  back?: "lectures";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [person, setPerson] = useState<Person>(event?.person ?? defaultPerson);
  const [allDay, setAllDay] = useState(event ? !event.start_time : false);

  return (
    <form action={formAction} className="card space-y-5">
      {back && <input type="hidden" name="back" value={back} />}
      <fieldset className="field">
        <span>누구 일정</span>
        <div className="grid grid-cols-4 gap-2">
          {PERSONS.map((p) => (
            <label key={p.v} className={`choice ${person === p.v ? "choice-on" : ""}`}>
              <input
                type="radio"
                name="person"
                value={p.v}
                checked={person === p.v}
                onChange={() => setPerson(p.v)}
                className="sr-only"
              />
              <span className={`mr-1 inline-block h-2.5 w-2.5 rounded-full ${p.cls}`} />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>제목</span>
        <input name="title" required maxLength={200} defaultValue={event?.title} placeholder="예: 소아과 예방접종" className="input" />
      </label>

      <label className="field">
        <span>날짜</span>
        <input name="event_date" type="date" required defaultValue={event?.event_date ?? defaultDate} className="input" />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" />
        종일
      </label>

      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span>시작</span>
            <input name="start_time" type="time" defaultValue={event?.start_time?.slice(0, 5)} className="input" />
          </label>
          <label className="field">
            <span>끝</span>
            <input name="end_time" type="time" defaultValue={event?.end_time?.slice(0, 5)} className="input" />
          </label>
        </div>
      )}

      <label className="field">
        <span>메모 (선택)</span>
        <textarea name="memo" rows={3} maxLength={2000} defaultValue={event?.memo ?? ""} className="input" />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "저장 중…" : submitLabel}
      </button>
    </form>
  );
}
