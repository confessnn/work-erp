"use client";

import { useState } from "react";
import { dateLabel } from "@/lib/format";
import { INCOME_TYPE_LABEL, type IncomeType } from "@/features/lectures/tax";
import { importEvents } from "../actions";
import type { Candidate } from "../queries";

export function ImportList({ events }: { events: Candidate[] }) {
  const selectable = events.filter((e) => !e.imported);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [incomeType, setIncomeType] = useState<IncomeType>("business");
  const allOn = selectable.length > 0 && checked.size === selectable.length;

  const toggle = (uid: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });

  if (events.length === 0) {
    return <p className="card text-center text-muted">해당 기간에 일정이 없습니다.</p>;
  }

  return (
    <form action={importEvents} className="space-y-4">
      <section className="card space-y-3">
        <h2 className="section-title">불러올 때 적용할 값</h2>
        <p className="text-sm text-muted">불러온 뒤 일정마다 수정할 수 있습니다.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="field">
            <span>시간당 강의료 (원)</span>
            <input name="hourly_rate" type="number" min="0" step="1000" className="input" placeholder="예: 300000" />
          </label>
          <fieldset className="field">
            <span>소득 구분</span>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(INCOME_TYPE_LABEL) as IncomeType[]).map((t) => (
                <label key={t} className={`choice ${incomeType === t ? "choice-on" : ""}`}>
                  <input
                    type="radio"
                    name="income_type"
                    value={t}
                    checked={incomeType === t}
                    onChange={() => setIncomeType(t)}
                    className="sr-only"
                  />
                  {INCOME_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="apply_tax_exemption" defaultChecked /> 소액 면제 적용
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="organization_from_location" defaultChecked /> 캘린더의 &apos;장소&apos;를 기관으로 사용
        </label>
      </section>

      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() => setChecked(allOn ? new Set() : new Set(selectable.map((e) => e.uid)))}
          />
          전체 선택
        </label>
        <span className="text-muted">{checked.size}개 선택</span>
      </div>

      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.uid}>
            <label className={`card flex items-center gap-3 ${e.imported ? "opacity-50" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                name="event"
                value={JSON.stringify(e)}
                disabled={e.imported}
                checked={checked.has(e.uid)}
                onChange={() => toggle(e.uid)}
              />
              <div className="w-24 shrink-0 text-sm">
                <div className="font-semibold">{dateLabel(e.date)}</div>
                <div className="text-muted">{e.allDay ? "종일" : `${e.start ?? ""}–${e.end ?? ""}`}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.title}</div>
                {e.location && <div className="truncate text-sm text-muted">{e.location}</div>}
              </div>
              {e.imported && <span className="badge badge-paid">불러옴</span>}
              {e.inErp && (
                <span className="badge badge-unpaid" title="같은 날짜·시각의 일정이 ERP에 있습니다. 불러오면 새로 만들지 않고 연결만 합니다.">
                  ERP에 있음
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-4">
        <button type="submit" disabled={checked.size === 0} className="btn-primary w-full shadow-lg">
          선택한 {checked.size}개를 강의 일정으로 저장
        </button>
      </div>
    </form>
  );
}
