import { KIND_COLOR, kindInfo } from "../care";
import { DAY_MIN, type Segment } from "../pattern";

const C = 200; // 가운데
const R_IN = 66;
const R_OUT = 176;

const polar = (min: number, r: number) => {
  const a = (min / DAY_MIN) * 2 * Math.PI - Math.PI / 2; // 0시가 위
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

function wedge(s: Segment) {
  const [x1, y1] = polar(s.start, R_OUT);
  const [x2, y2] = polar(s.end, R_OUT);
  const [x3, y3] = polar(s.end, R_IN);
  const [x4, y4] = polar(s.start, R_IN);
  const large = s.end - s.start > DAY_MIN / 2 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1)},${f(y1)}A${R_OUT},${R_OUT} 0 ${large} 1 ${f(x2)},${f(y2)}L${f(x3)},${f(y3)}A${R_IN},${R_IN} 0 ${large} 0 ${f(x4)},${f(y4)}Z`;
}

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

/** 일과표: 24시간 시계 위에 그날 기록을 부채꼴로 (0시가 위, 시계 방향) */
export function DayClock({ segments, center, sub, nowMin }: { segments: Segment[]; center: string; sub?: string; nowMin?: number | null }) {
  return (
    <svg viewBox="0 0 400 400" className="mx-auto h-auto w-full max-w-md text-muted" role="img" aria-label="하루 일과표 (24시간)">
      <circle cx={C} cy={C} r={(R_IN + R_OUT) / 2} fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth={R_OUT - R_IN} />
      {Array.from({ length: 24 }, (_, h) => {
        const [x1, y1] = polar(h * 60, R_OUT + 4);
        const [x2, y2] = polar(h * 60, R_OUT + (h % 2 ? 7 : 10));
        const [tx, ty] = polar(h * 60, R_OUT + 20);
        return (
          <g key={h}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity=".5" />
            {h % 2 === 0 && (
              <text x={tx} y={ty + 4} textAnchor="middle" fontSize="12" fill="currentColor">
                {h}
              </text>
            )}
          </g>
        );
      })}
      {segments.map((s) => (
        <path key={s.id + s.start} d={wedge(s)} fill={KIND_COLOR[s.kind]}>
          <title>{`${kindInfo(s.kind).label} ${hm(s.start)}${s.end - s.start > 6 ? `~${hm(s.end)}` : ""}`}</title>
        </path>
      ))}
      {nowMin != null && (
        <line
          x1={polar(nowMin, R_IN)[0]}
          y1={polar(nowMin, R_IN)[1]}
          x2={polar(nowMin, R_OUT)[0]}
          y2={polar(nowMin, R_OUT)[1]}
          stroke="var(--color-danger)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      )}
      <circle cx={C} cy={C} r={R_IN - 2} fill="var(--color-surface)" />
      {sub && (
        <text x={C} y={C - 10} textAnchor="middle" fontSize="13" fill="currentColor">
          {sub}
        </text>
      )}
      <text x={C} y={C + (sub ? 18 : 8)} textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--color-fg)">
        {center}
      </text>
    </svg>
  );
}

/** 주간 패턴: 하루를 한 줄(0~24시)로, 여러 날을 위아래로 쌓는다 */
export function WeekBars({ rows }: { rows: { label: string; segments: Segment[]; href?: string; on?: boolean }[] }) {
  return (
    <div className="space-y-1.5">
      <div className="ml-16 flex justify-between text-[11px] tabular-nums text-muted">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className={`w-14 shrink-0 text-right text-xs tabular-nums ${r.on ? "font-semibold text-fg" : "text-muted"}`}>{r.label}</span>
          <svg viewBox={`0 0 ${DAY_MIN} 20`} preserveAspectRatio="none" className="h-5 flex-1 overflow-hidden rounded-md bg-fg/5" aria-label={`${r.label} 패턴`}>
            {[360, 720, 1080].map((m) => (
              <line key={m} x1={m} x2={m} y1={0} y2={20} stroke="currentColor" strokeOpacity=".12" className="text-muted" />
            ))}
            {r.segments.map((s) => (
              <rect key={s.id + s.start} x={s.start} width={Math.max(4, s.end - s.start)} y={0} height={20} fill={KIND_COLOR[s.kind]}>
                <title>{`${kindInfo(s.kind).label} ${hm(s.start)}`}</title>
              </rect>
            ))}
          </svg>
        </div>
      ))}
    </div>
  );
}
