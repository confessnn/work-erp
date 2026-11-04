"use client";

import { useActionState, useState } from "react";
import { INCOME_TYPE_LABEL, type IncomeType } from "@/features/lectures/tax";
import { saveAutoSettings, syncNow, type SourceState } from "../actions";
import type { CalendarSource } from "../queries";

export function AutoSettings({ source }: { source: CalendarSource }) {
  const [saveState, saveAction, saving] = useActionState<SourceState, FormData>(
    saveAutoSettings.bind(null, source.id),
    {},
  );
  const [syncState, syncAction, syncing] = useActionState<SourceState>(syncNow.bind(null, source.id), {});
  const [incomeType, setIncomeType] = useState<IncomeType>(source.income_type);
  const [auto, setAuto] = useState(source.auto_import);

  return (
    <div className="space-y-4">
      <form action={saveAction} className="space-y-3">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" name="auto_import" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          매일 아침 6시에 새 일정 자동으로 불러오기
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="field">
            <span>이 단어가 들어간 일정만 (쉼표로 여러 개)</span>
            <input name="keyword" defaultValue={source.keyword ?? ""} placeholder="예: 강의, 특강, 출강" className="input" />
          </label>
          <label className="field">
            <span>시간당 강의료 (원)</span>
            <input
              name="hourly_rate"
              type="number"
              min="0"
              step="1000"
              defaultValue={source.hourly_rate || ""}
              placeholder="예: 300000"
              className="input"
            />
          </label>
        </div>
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="apply_tax_exemption" defaultChecked={source.apply_tax_exemption} /> 소액 면제 적용
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="org_from_location" defaultChecked={source.org_from_location} /> 캘린더 &apos;장소&apos;를 기관으로
          </label>
        </div>
        <p className="text-xs text-muted">
          오늘 이후 일정만 가져옵니다. 이미 있는 일정은 다시 가져오지 않고, 여기서 불러온 뒤 삭제한 일정도 다시 가져오지 않습니다.
          강의료·소득 구분은 불러온 뒤 일정마다 수정할 수 있습니다.
        </p>
        {saveState.error && <p className="text-sm text-danger">{saveState.error}</p>}
        {saveState.message && <p className="text-sm text-success">{saveState.message}</p>}
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "저장 중…" : "설정 저장"}
        </button>
      </form>

      <form action={syncAction} className="flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
        <button type="submit" disabled={syncing} className="chip">
          {syncing ? "불러오는 중…" : "저장된 설정으로 지금 불러오기"}
        </button>
        {syncState.error && <span className="text-danger">{syncState.error}</span>}
        {syncState.message && <span className="text-success">{syncState.message}</span>}
        {!syncState.error && !syncState.message && source.last_sync_result && (
          <span className="text-muted">
            최근: {source.last_sync_result}
            {source.last_synced_at &&
              ` (${new Date(source.last_synced_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })})`}
          </span>
        )}
      </form>
    </div>
  );
}
