import Link from "next/link";
import { circleLayout, connectedNodes, DIRECTED, edgeLine, type Graph } from "../graph";

const SIZE = 640;
const short = (s: string, n = 8) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 일 간의 관계도: 관계가 있는 일을 원 둘레에 놓고 선으로 잇는다. 점을 누르면 그 일의 기록으로 */
export function GraphView({ graph }: { graph: Graph }) {
  const { connected, alone } = connectedNodes(graph);
  const placed = circleLayout(connected, SIZE);
  const at = new Map(placed.map((p) => [p.key, p]));
  const name = new Map(graph.nodes.map((n) => [n.key, n.name]));

  return (
    <div className="space-y-4">
      {connected.length > 0 && (
        <div className="card overflow-hidden p-2">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block h-auto w-full max-w-[640px]" role="img" aria-label="일 간의 관계도">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="fill-accent" />
              </marker>
            </defs>
            {graph.relations.map((r, i) => {
              const a = at.get(r.from);
              const b = at.get(r.to);
              if (!a || !b) return null;
              const l = edgeLine(a, b);
              const directed = DIRECTED.has(r.kind);
              return (
                <g key={i}>
                  <title>{`${name.get(r.from)} → ${name.get(r.to)} · ${r.kind}: ${r.reason}`}</title>
                  <line
                    {...l}
                    strokeWidth={2}
                    strokeDasharray={directed ? undefined : "6 5"}
                    className={directed ? "stroke-accent" : "stroke-muted"}
                    markerEnd={directed ? "url(#arrow)" : undefined}
                  />
                  <text
                    x={(l.x1 + l.x2) / 2}
                    y={(l.y1 + l.y2) / 2 + 6}
                    textAnchor="middle"
                    fontSize={20}
                    strokeWidth={6}
                    paintOrder="stroke"
                    className="fill-muted stroke-surface"
                  >
                    {r.kind}
                  </text>
                </g>
              );
            })}
            {placed.map((p) => (
              <a key={p.key} href={`/records?s=${encodeURIComponent(p.key)}`}>
                <title>{`${p.name} · 기록 ${p.count}개`}</title>
                <circle cx={p.x} cy={p.y} r={p.r} strokeWidth={2} className="fill-accent-soft stroke-accent" />
                <text
                  x={p.x}
                  y={p.y + p.r + 24}
                  textAnchor="middle"
                  fontSize={23}
                  strokeWidth={6}
                  paintOrder="stroke"
                  className="fill-fg stroke-surface font-medium"
                >
                  {short(p.name)}
                </text>
              </a>
            ))}
          </svg>
          <p className="px-2 pb-1 text-xs text-muted">실선 화살표: 준비·후속·영향 (방향 있음) · 점선: 같은 자료·같은 대상·비슷한 문제 · 점이 클수록 기록이 많아요</p>
        </div>
      )}

      {graph.relations.length === 0 ? (
        <p className="card text-sm text-muted">기록에서 근거가 있는 관계를 찾지 못했어요. 기록이 더 쌓이면 다시 찾아 보세요.</p>
      ) : (
        <section className="card space-y-2">
          <h2 className="section-title">찾은 관계 {graph.relations.length}개</h2>
          <ul className="divide-y divide-line">
            {graph.relations.map((r, i) => (
              <li key={i} className="space-y-1 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-2">
                  <Link href={`/records?s=${encodeURIComponent(r.from)}`} className="font-medium hover:underline">
                    {name.get(r.from)}
                  </Link>
                  <span className="text-muted">{DIRECTED.has(r.kind) ? "→" : "↔"}</span>
                  <Link href={`/records?s=${encodeURIComponent(r.to)}`} className="font-medium hover:underline">
                    {name.get(r.to)}
                  </Link>
                  <span className="badge">{r.kind}</span>
                </div>
                <p>{r.reason}</p>
                {r.evidence.length > 0 && <p className="text-xs text-muted">근거 기록: {r.evidence.join(", ")}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {alone.length > 0 && (
        <p className="text-xs text-muted">
          관계를 못 찾은 일: {alone.map((n) => n.name).join(", ")}
        </p>
      )}
    </div>
  );
}
