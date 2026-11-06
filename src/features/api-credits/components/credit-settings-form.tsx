"use client";

import { useState, useTransition } from "react";
import { saveCreditSettings } from "../actions";
import type { ApiProvider, CreditSettings, ReloadMode } from "../types";

const dollars = (cents: number | null | undefined) => (cents == null ? "" : String(cents / 100));

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
    <details className="rounded-lg border border-line p-3 text-sm">
      <summary className="cursor-pointer font-medium">잔액·자동 충전 설정</summary>
      <div className="mt-3 space-y-3">
        <label className="field">
          <span>현재 잔액 ($)</span>
          <input className="input tabular-nums" inputMode="decimal" placeholder="다시 맞출 때만 입력" value={balance} onChange={(e) => setBalance(e.target.value)} />
          <small className="text-muted">
            Console의 잔액을 넣으세요.
            {settings?.base_date && ` 마지막 입력: ${settings.base_date}, $${dollars(settings.base_balance_cents)}`}
          </small>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">
            <span>충전 기준 ($)</span>
            <input className="input tabular-nums" inputMode="decimal" placeholder="예: 2" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            <small className="text-muted">잔액이 이 아래로 내려가면 충전</small>
          </label>
          <label className="field">
            <span>{mode === "add" ? "충전 금액 ($)" : "채울 잔액 ($)"}</span>
            <input className="input tabular-nums" inputMode="decimal" placeholder="예: 5" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>충전 방식</span>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as ReloadMode)}>
            <option value="add">정해진 금액을 더함</option>
            <option value="to">정해진 잔액까지 채움</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending} onClick={save} className={`btn-primary ${pending ? "opacity-50" : ""}`}>
            {pending ? "저장 중…" : "저장"}
          </button>
          {message && <span className="text-muted">{message}</span>}
        </div>
      </div>
    </details>
  );
}
