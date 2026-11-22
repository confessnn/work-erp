import type { CurvePoint } from "../growth";

export type ChartPoint = { day: number; value: number; title: string };

const W = 640;
const H = 300;
const PAD = { l: 44, r: 40, t: 14, b: 30 };

/** 성장 곡선: WHO 3·50·97 백분위 선 위에 우리 아기 기록을 점으로 (서버에서 그리는 SVG) */
export function GrowthChart({ curve, points, unit, step }: { curve: CurvePoint[]; points: ChartPoint[]; unit: string; step: number }) {
  if (curve.length < 2) return null;
  const x0 = curve[0].day;
  const x1 = curve[curve.length - 1].day;
  const vals = [...curve.flatMap((c) => [c.p3, c.p97]), ...points.map((p) => p.value)];
  const y0 = Math.floor(Math.min(...vals) / step) * step;
  const y1 = Math.ceil(Math.max(...vals) / step) * step;
  const sx = (d: number) => PAD.l + ((d - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const line = (k: "p3" | "p50" | "p97") => curve.map((c, i) => `${i ? "L" : "M"}${sx(c.day).toFixed(1)},${sy(c[k]).toFixed(1)}`).join("");
  const band =
    curve.map((c, i) => `${i ? "L" : "M"}${sx(c.day).toFixed(1)},${sy(c.p97).toFixed(1)}`).join("") +
    [...curve].reverse().map((c) => `L${sx(c.day).toFixed(1)},${sy(c.p3).toFixed(1)}`).join("") +
    "Z";

  const yTicks: number[] = [];
  for (let v = y0; v <= y1 + 1e-9; v += step) yTicks.push(Math.round(v * 10) / 10);
  const monthStep = x1 - x0 > 240 ? 60 : 30;
  const xTicks: number[] = [];
  for (let d = Math.ceil(x0 / monthStep) * monthStep; d <= x1; d += monthStep) xTicks.push(d);
  const last = curve[curve.length - 1];
  const sorted = [...points].sort((a, b) => a.day - b.day);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full text-muted" role="img" aria-label={`성장 곡선 (${unit})`}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke="currentColor" strokeOpacity=".15" />
          <text x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="currentColor">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((d) => (
        <text key={d} x={sx(d)} y={H - 10} textAnchor="middle" fontSize="11" fill="currentColor">
          {d === 0 ? "출생" : `${d / 30}개월`}
        </text>
      ))}
      <text x={PAD.l} y={PAD.t - 2} fontSize="11" fill="currentColor">
        {unit}
      </text>
      <path d={band} fill="var(--color-accent)" fillOpacity=".07" />
      <path d={line("p3")} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" />
      <path d={line("p97")} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" />
      <path d={line("p50")} fill="none" stroke="currentColor" strokeWidth="1.6" />
      {(["p97", "p50", "p3"] as const).map((k) => (
        <text key={k} x={W - PAD.r + 4} y={sy(last[k]) + 4} fontSize="11" fill="currentColor">
          {k.slice(1)}%
        </text>
      ))}
      {sorted.length > 1 && (
        <path
          d={sorted.map((p, i) => `${i ? "L" : "M"}${sx(p.day).toFixed(1)},${sy(p.value).toFixed(1)}`).join("")}
          fill="none"
          stroke="var(--color-danger)"
          strokeWidth="1.6"
        />
      )}
      {sorted.map((p, i) => (
        <circle key={i} cx={sx(p.day)} cy={sy(p.value)} r="4.5" fill="var(--color-danger)" stroke="var(--color-surface)" strokeWidth="1.5">
          <title>{p.title}</title>
        </circle>
      ))}
    </svg>
  );
}
