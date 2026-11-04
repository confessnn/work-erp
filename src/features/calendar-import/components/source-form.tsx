"use client";

import { useActionState } from "react";
import { addSource, type SourceState } from "../actions";

export function SourceForm() {
  const [state, action, pending] = useActionState<SourceState, FormData>(addSource, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="field">
          <span>이름</span>
          <input name="name" placeholder="구글 캘린더" className="input" />
        </label>
        <label className="field">
          <span>iCal 비밀 주소</span>
          <input
            name="ics_url"
            required
            placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
            className="input"
            autoComplete="off"
          />
        </label>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "저장 중…" : "캘린더 연결"}
      </button>
    </form>
  );
}
