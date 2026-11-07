"use client";

import { useActionState, useState, useTransition } from "react";
import { addFamilySource, deleteFamilySource, syncFamilySource } from "../actions";
import type { FamilySource } from "../queries";
import { PERSONS, personOf, type Person } from "../types";

export function AddSourceForm({ defaultPerson }: { defaultPerson: Person }) {
  const [state, action, pending] = useActionState(addFamilySource, {});
  const [person, setPerson] = useState<Person>(defaultPerson);
  return (
    <form action={action} className="space-y-4">
      <fieldset className="field">
        <span>누구 캘린더</span>
        <div className="grid grid-cols-4 gap-2">
          {PERSONS.map((p) => (
            <label key={p.v} className={`choice ${person === p.v ? "choice-on" : ""}`}>
              <input type="radio" name="person" value={p.v} checked={person === p.v} onChange={() => setPerson(p.v)} className="sr-only" />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>이름 (선택)</span>
        <input name="name" maxLength={50} placeholder="예: 엄마 구글 캘린더" className="input" />
      </label>
      <label className="field">
        <span>iCal 형식의 비공개 주소</span>
        <input
          name="ics_url"
          required
          inputMode="url"
          autoComplete="off"
          placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
          className="input font-mono text-xs"
        />
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "연결하고 가져오는 중…" : "연결하고 가져오기"}
      </button>
    </form>
  );
}

export function SourceList({ sources }: { sources: FamilySource[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (sources.length === 0) return <p className="text-sm text-muted">아직 연결한 캘린더가 없어요.</p>;
  return (
    <ul className="space-y-3">
      {msg && <li className="text-sm">{msg}</li>}
      {sources.map((s) => (
        <li key={s.id} className="space-y-1 border-t border-line pt-3 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${personOf(s.person).cls}`}>{personOf(s.person).label}</span>
            <b className="text-sm">{s.name}</b>
          </div>
          <p className="text-xs text-muted">
            {s.last_synced_at ? `${new Date(s.last_synced_at).toLocaleString("ko-KR")} · ${s.last_result ?? ""}` : "아직 가져오지 않음"}
          </p>
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              disabled={pending}
              className="hover:underline disabled:text-muted"
              onClick={() =>
                start(async () => {
                  const r = await syncFamilySource(s.id);
                  setMsg(r.error ? `가져오지 못했어요: ${r.error}` : `${r.count}개 일정을 가져왔어요.`);
                })
              }
            >
              {pending ? "가져오는 중…" : "지금 가져오기"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="text-danger hover:underline"
              onClick={() => {
                if (confirm("연결을 끊을까요? 이 캘린더에서 가져온 일정도 가족 달력에서 지워져요. 구글 캘린더 원본은 그대로예요."))
                  start(() => deleteFamilySource(s.id));
              }}
            >
              연결 끊기
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
