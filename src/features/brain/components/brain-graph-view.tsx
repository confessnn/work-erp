import Link from "next/link";
import { buildBrainGraph, forceLayout, type NoteRef } from "../graph";
import { SECTION_LABEL, SECTIONS, type Section } from "../vault";

const SIZE = 720;
const short = (s: string, n = 10) => (s.length > n ? `${s.slice(0, n)}…` : s);

const COLOR: Record<Section, string> = {
  inbox: "fill-peach",
  projects: "fill-accent",
  areas: "fill-mint",
  resources: "fill-sky",
  archives: "fill-muted",
  erp: "fill-ochre",
  other: "fill-lilac",
};

/** 옵시디언 그래프 뷰처럼: 노트는 점, [[링크]]는 선. 점을 누르면 노트로 */
export function BrainGraphView({ notes }: { notes: NoteRef[] }) {
  const g = buildBrainGraph(notes);
  const placed = forceLayout(g.nodes, g.edges, SIZE);
  const at = new Map(placed.map((p) => [p.id, p]));
  const labelMin = placed.length > 40 ? 2 : 0; // 점이 많으면 연결 많은 노트만 이름을 쓴다

  if (!placed.length) {
    return <p className="card text-center text-sm text-muted">아직 [[링크]]로 이어진 노트가 없어요. 옵시디언에서 노트끼리 링크를 걸어 보세요.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="card overflow-hidden p-2">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block h-auto w-full max-w-[720px]" role="img" aria-label="노트 그래프">
          {g.edges.map((e, i) => {
            const a = at.get(e.from)!;
            const b = at.get(e.to)!;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1} className="stroke-line" />;
          })}
          {placed.map((p) => {
            const dot = (
              <g>
                <title>{`${p.title} · 연결 ${p.degree}${p.ghost ? " · 아직 없는 노트" : ""}`}</title>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.r}
                  className={p.ghost ? "fill-surface stroke-muted" : `${COLOR[p.section]} stroke-surface`}
                  strokeWidth={1.5}
                  strokeDasharray={p.ghost ? "3 2" : undefined}
                />
                {p.degree >= labelMin && (
                  <text x={p.x} y={p.y + p.r + 11} textAnchor="middle" className={`${p.ghost ? "fill-muted" : "fill-fg"} text-[10px]`}>
                    {short(p.title)}
                  </text>
                )}
              </g>
            );
            return p.ghost ? (
              <g key={p.id}>{dot}</g>
            ) : (
              <Link key={p.id} href={`/brain/note/${p.id}`}>
                {dot}
              </Link>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {SECTIONS.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <svg width="10" height="10" aria-hidden>
              <circle cx="5" cy="5" r="5" className={COLOR[s]} />
            </svg>
            {SECTION_LABEL[s]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="4" className="fill-surface stroke-muted" strokeDasharray="2 1.5" />
          </svg>
          아직 없는 노트 (링크만)
        </span>
      </div>
      <p className="text-xs text-muted">
        이어진 노트 {placed.length}개{g.truncated ? ` (연결 많은 순으로 ${placed.length}개만)` : ""} · 링크 {g.edges.length}개 · 혼자 있는 노트 {g.alone}개
      </p>
    </div>
  );
}
