"use client";

import { startTransition, useActionState, useState } from "react";
import { won } from "@/lib/format";
import type { FormState } from "../actions";
import { calculateWithholding, grossFrom, hoursBetween, INCOME_TYPE_LABEL, type IncomeType } from "../tax";
import type { Lecture } from "../types";

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  lecture?: Lecture;
  organizations: string[];
  defaultDate?: string;
  submitLabel: string;
};

export function LectureForm({ action, lecture, organizations, defaultDate, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  const [start, setStart] = useState(lecture?.start_time?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(lecture?.end_time?.slice(0, 5) ?? "");
  const [hoursInput, setHoursInput] = useState(lecture ? String(Number(lecture.hours)) : "");
  const [rate, setRate] = useState(lecture ? String(lecture.hourly_rate) : "");
  const initialAuto = lecture ? grossFrom(Number(lecture.hours), lecture.hourly_rate) : 0;
  const [grossOverride, setGrossOverride] = useState(
    lecture && lecture.gross_amount !== initialAuto ? String(lecture.gross_amount) : "",
  );
  const [incomeType, setIncomeType] = useState<IncomeType>(lecture?.income_type ?? "business");
  const [exemption, setExemption] = useState(lecture?.apply_tax_exemption ?? true);
  const [isPaid, setIsPaid] = useState(lecture?.is_paid ?? false);

  const autoHours = hoursBetween(start, end);
  const hours = hoursInput !== "" ? Number(hoursInput) : autoHours;
  const rateNum = Number(rate.replaceAll(",", "")) || 0;
  const gross = grossOverride !== "" ? Number(grossOverride.replaceAll(",", "")) || 0 : grossFrom(hours, rateNum);
  const tax = calculateWithholding(gross, incomeType, exemption);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // 기본 form action 은 제출 후 입력칸을 비운다 → 오류가 나도 입력한 내용이 남도록 직접 제출
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="space-y-6"
    >
      <section className="card space-y-4">
        <h2 className="section-title">일정</h2>
        <label className="field">
          <span>강의명 *</span>
          <input name="title" required defaultValue={lecture?.title} className="input" placeholder="예: 원가계산 실무 특강" />
        </label>
        <label className="field">
          <span>기관</span>
          <input
            name="organization"
            list="org-list"
            defaultValue={lecture?.organization ?? ""}
            className="input"
            placeholder="예: OO대학교"
          />
          <datalist id="org-list">
            {organizations.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="field">
            <span>날짜 *</span>
            <input
              name="lecture_date"
              type="date"
              required
              defaultValue={lecture?.lecture_date ?? defaultDate}
              className="input"
            />
          </label>
          <label className="field">
            <span>시작</span>
            <input name="start_time" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span>종료</span>
            <input name="end_time" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input" />
          </label>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="section-title">강의료</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field">
            <span>강의 시간</span>
            <input
              name="hours"
              type="number"
              step="0.25"
              min="0"
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              placeholder={autoHours ? `${autoHours} (시작·종료로 자동 계산)` : "시작·종료를 넣으면 자동 계산"}
              className="input"
            />
          </label>
          <label className="field">
            <span>시간당 강의료 (원)</span>
            <input
              name="hourly_rate"
              type="number"
              min="0"
              step="1000"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="input"
              placeholder="예: 300000"
            />
          </label>
        </div>
        <label className="field">
          <span>총 강의료 직접 입력 (선택 — 고정 금액으로 받는 경우)</span>
          <input
            name="gross_override"
            type="number"
            min="0"
            value={grossOverride}
            onChange={(e) => setGrossOverride(e.target.value)}
            className="input"
            placeholder={`비워두면 시간 × 시간당 = ${won(grossFrom(hours, rateNum))}`}
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">소득 구분</legend>
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
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              name="apply_tax_exemption"
              checked={exemption}
              onChange={(e) => setExemption(e.target.checked)}
              className="mt-1"
            />
            소액 면제 적용 (기타소득 12.5만 원 이하 과세최저한 · 소득세 1,000원 미만 소액부징수)
          </label>
        </fieldset>

        <div className="space-y-2 text-sm">
          <p className="text-muted">저장하면 제목이 같고 강의료가 비어 있는 일정에도 자동으로 들어갑니다. 금액은 일정별 시간으로 계산합니다.</p>
          {lecture && (
            <label className="flex items-start gap-2">
              <input type="checkbox" name="apply_same_title" className="mt-1" />
              이미 입력한 같은 제목 일정도 이 강의료로 바꾸기 (받은 일정 제외)
            </label>
          )}
        </div>

        <dl className="calc">
          <div><dt>총 강의료</dt><dd>{won(gross)}</dd></div>
          <div><dt>소득세</dt><dd>− {won(tax.incomeTax)}</dd></div>
          <div><dt>지방소득세</dt><dd>− {won(tax.localTax)}</dd></div>
          <div className="calc-total"><dt>예상 수령액</dt><dd>{won(tax.net)}</dd></div>
        </dl>
      </section>

      <section className="card space-y-4">
        <h2 className="section-title">수령</h2>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_paid" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
          <span>강의료를 받았어요</span>
        </label>
        {isPaid && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="field">
              <span>수령일</span>
              <input name="paid_date" type="date" defaultValue={lecture?.paid_date ?? ""} className="input" />
            </label>
            <label className="field">
              <span>실제 받은 금액 (원)</span>
              <input
                name="paid_amount"
                type="number"
                min="0"
                defaultValue={lecture?.paid_amount ?? ""}
                placeholder={`비워두면 ${won(tax.net)}`}
                className="input"
              />
            </label>
          </div>
        )}
        <label className="field">
          <span>메모</span>
          <textarea name="memo" rows={2} defaultValue={lecture?.memo ?? ""} className="input" />
        </label>
      </section>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.duplicate && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allow_duplicate" /> 다른 강의가 맞습니다. 그래도 저장
        </label>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "저장 중…" : submitLabel}
      </button>
    </form>
  );
}
