"use client";

import { useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * 24시간제 시간 고르기 (시 0~23 + 분 5분 단위). 휴대폰 기본 시간 입력의 오전/오후 표시가 헷갈려서 쓴다.
 * 폼에는 name 으로 "HH:MM"(비우면 "")을 보낸다. value/onChange 를 주면 바깥에서 값을 관리한다.
 */
export function TimeSelect({
  name,
  value,
  defaultValue,
  onChange,
  allowEmpty = true,
}: {
  name: string;
  value?: string;
  defaultValue?: string | null;
  onChange?: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const [inner, setInner] = useState((defaultValue ?? "").slice(0, 5));
  const current = (value ?? inner).slice(0, 5);
  const [h, m] = current ? current.split(":") : ["", ""];
  const set = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
  };
  // 예전에 5분 단위가 아닌 시각으로 저장한 일정도 그대로 보이게
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES;

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={current} />
      <select
        aria-label="시"
        value={h}
        onChange={(e) => set(e.target.value ? `${e.target.value}:${m || "00"}` : "")}
        className="input w-auto flex-1 tabular-nums"
      >
        {allowEmpty && <option value="">--</option>}
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}시
          </option>
        ))}
      </select>
      <span className="text-muted">:</span>
      <select
        aria-label="분"
        value={m}
        disabled={!h}
        onChange={(e) => set(`${h}:${e.target.value}`)}
        className="input w-auto flex-1 tabular-nums"
      >
        {!h && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>
            {x}분
          </option>
        ))}
      </select>
    </div>
  );
}
