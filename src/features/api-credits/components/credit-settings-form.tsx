"use client";

import { useState, useTransition } from "react";
import { saveCreditSettings } from "../actions";
import type { ApiProvider, CreditSettings, ReloadMode } from "../types";

const INPUT = "input px-2 py-1 text-sm tabular-nums";

const dollars =(cents: number | null | undefined) => (cents == null ? "" : String(cents / 100));

/** 잔액·자동 충전 설정. 잔액은 조회 API가 없어 Console 화면의 값을 직접 넣는다 */
export function CreditSettingsForm({ provider, settings }: { provider: ApiProvider; settings: CreditSettings | undefined }) {
  const [balance, setBalance] = useState("");
  const [threshold, setThreshold] = useState(dollars(settings?.reload_threshold_cents));
  const [amount, setAmount] = useState(dollars(settings?.reload_amount_cents));
  const [mode, setMode] = useState<ReloadMode>(settings?.reload_mode ?? "add");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await saveCreditSettings(provider, { balance, threshold, amount, mode });
      setMessage(result.error ?? "저장했습니다.");
      if (!result.error) setBalance("");
    });

  return (
    <details className="rounded-lg border border-line px-2 py-1.5 text-xs">
      <summary className="cursor-pointer font-medium">잔액·충전 설정</summary>
      <div className="mt-2 space-y-2">
        <label className="field text-xs">
          <span>현재 잔액 ($)</span>
          <input className={INPUT} inputMode="decimal" placeholder="맞출 때만 입력" value={balance} onChange={(e) => setBalance(e.target.value)} />
          <small className="text-[11px] leading-tight text-muted">
            결제 화면의 잔액을 넣으세요.
            {settings?.base_date && ` 마지막: ${settings.base_date}, $${dollars(settings.base_balance_cents)}`}
          </small>
        </label>
        <label className="field text-xs">
          <span>충전 기준 ($)</span>
          <input className={INPUT} inputMode="decimal" placeholder="예: 2" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
        <label className="field text-xs">
          <span>{mode === "add" ? "충전 금액 ($)" : "채울 잔액 ($)"}</span>
          <input className={INPUT} inputMode="decimal" placeholder="예: 5" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field text-xs">
          <span>충전 방식</span>
          <select className={INPUT} value={mode} onChange={(e) => setMode(e.target.value as ReloadMode)}>
            <option value="add">금액 더하기</option>
            <option value="to">잔액까지 채우기</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={save} className={`btn-primary px-3 py-1 text-xs ${pending ? "opacity-50" : ""}`}>
            {pending ? "저장 중…" : "저장"}
          </button>
          {message && <span className="break-words text-muted">{message}</span>}
        </div>
      </div>
    </details>
  );
}
