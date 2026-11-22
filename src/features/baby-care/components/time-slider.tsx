"use client";

import { useState } from "react";
import { addMinutesLocal, fromLocalInput } from "../care";

const RANGE = 240; // 좌우 4시간
const TICKS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

/**
 * 휴대폰에서 손가락을 옆으로 밀어 시각을 고르는 막대.
 * 창을 연 시각을 가운데(0)로 두고 앞뒤 4시간 안에서 1분씩 움직인다. 더 멀면 아래 날짜·시각 칸에서 고친다.
 */
export function TimeSlider({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [anchor, setAnchor] = useState(value);
  const a = fromLocalInput(anchor);
  const cur = fromLocalInput(value);
  const offset = a && cur ? Math.round((Date.parse(cur) - Date.parse(a)) / 60_000) : 0;
  // 칸에서 직접 4시간 넘게 고치면 그 시각을 새 가운데로 삼는다
  if (Math.abs(offset) > RANGE) setAnchor(value);

  const move = (m: number) => {
    const next = addMinutesLocal(anchor, m);
    if (next) onChange(next);
  };
  const shift = (m: number) => {
    const next = addMinutesLocal(value, m);
    if (next) onChange(next);
  };

  return (
    <div className="space-y-1 rounded-2xl bg-fg/5 px-3 py-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-60)} className="chip text-xs">
          −1시간
        </button>
        <span className="text-2xl font-bold tabular-nums">{value.slice(11, 16)}</span>
        <button type="button" onClick={() => shift(60)} className="chip text-xs">
          +1시간
        </button>
      </div>
      <input
        type="range"
        min={-RANGE}
        max={RANGE}
        step={1}
        value={Math.max(-RANGE, Math.min(RANGE, offset))}
        onChange={(e) => move(Number(e.target.value))}
        aria-label="시각 고르기 (옆으로 밀기)"
        className="h-8 w-full touch-pan-y accent-[var(--color-accent)]"
      />
      <div className="flex justify-between px-1 text-[11px] tabular-nums text-muted">
        {TICKS.map((t) => (
          <span key={t} className={t === 0 ? "font-semibold text-fg" : ""}>
            {t > 0 ? `+${t}` : t}
          </span>
        ))}
      </div>
    </div>
  );
}
