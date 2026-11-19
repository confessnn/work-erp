// 일 간의 관계도: AI에 보낼 입력, AI 답 검사, 그림 배치 (순수 함수)
import type { Series } from "./series";

export const RELATION_KINDS = ["준비", "후속", "같은 자료", "같은 대상", "영향", "비슷한 문제"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
/** 방향이 있는 관계 (화살표로 그린다): from → to */
export const DIRECTED: ReadonlySet<RelationKind> = new Set(["준비", "후속", "영향"]);

export type GraphNode = { key: string; name: string; count: number };
export type Relation = { from: string; to: string; kind: RelationKind; reason: string; evidence: string[] };
export type Graph = { nodes: GraphNode[]; relations: Relation[] };

/** 관계를 찾으려면 기록이 있는 일이 이만큼은 있어야 한다 */
export const MIN_SERIES = 2;
/** AI에 보내는 양 제한: 일 개수, 일마다 최근 기록 개수, 기록 하나의 글자 수 */
export const MAX_SERIES = 60;
export const RECORDS_PER_SERIES = 8;
export const RECORD_CHARS = 400;

/** AI에 보낼 본문과, 본문 속 번호(S1, S2…) → 일 묶음 */
export function graphInput(series: Series[]): { text: string; ids: Map<string, Series> } {
  const ids = new Map<string, Series>();
  const blocks = series.slice(0, MAX_SERIES).map((s, i) => {
    const id = `S${i + 1}`;
    ids.set(id, s);
    const records = s.entries
      .slice(0, RECORDS_PER_SERIES)
      .map((e) => `- ${e.date}: ${e.record.replace(/\s+/g, " ").slice(0, RECORD_CHARS)}`)
      .join("\n");
    return `<work id="${id}" name="${s.name.replaceAll('"', "'")}" records="${s.entries.length}">\n${records}\n</work>`;
  });
  return { text: blocks.join("\n\n"), ids };
}

/** AI 답(JSON)을 검사해 관계로 바꾼다. 없는 번호·자기 자신·중복은 버린다 */
export function parseRelations(raw: unknown, ids: Map<string, Series>): Relation[] {
  const list = (raw as { relations?: unknown })?.relations;
  if (!Array.isArray(list)) throw new Error("AI 답의 형식이 맞지 않습니다.");
  const seen = new Set<string>();
  const out: Relation[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const from = ids.get(String(r?.from ?? ""));
    const to = ids.get(String(r?.to ?? ""));
    const kind = r?.kind as RelationKind;
    if (!from || !to || from.key === to.key || !RELATION_KINDS.includes(kind)) continue;
    // 방향 없는 관계는 A-B와 B-A를 같은 것으로 본다
    const pair = DIRECTED.has(kind) ? `${from.key}>${to.key}` : [from.key, to.key].sort().join("|");
    if (seen.has(`${kind}:${pair}`)) continue;
    seen.add(`${kind}:${pair}`);
    out.push({
      from: from.key,
      to: to.key,
      kind,
      reason: String(r?.reason ?? "").trim().slice(0, 300),
      evidence: (Array.isArray(r?.evidence) ? r.evidence : []).map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 5),
    });
  }
  return out;
}

/** 그림에 쓸 일: 관계가 있는 일만 (관계 없는 일은 그림 밖 목록으로) */
export function connectedNodes(graph: Graph): { connected: GraphNode[]; alone: GraphNode[] } {
  const used = new Set(graph.relations.flatMap((r) => [r.from, r.to]));
  return { connected: graph.nodes.filter((n) => used.has(n.key)), alone: graph.nodes.filter((n) => !used.has(n.key)) };
}

export type Placed = GraphNode & { x: number; y: number; r: number };

/** 원 둘레에 고르게 놓는다. 기록이 많은 일일수록 점이 크다 */
export function circleLayout(nodes: GraphNode[], size: number): Placed[] {
  const c = size / 2;
  const radius = nodes.length <= 1 ? 0 : size * 0.36;
  const max = Math.max(1, ...nodes.map((n) => n.count));
  return nodes.map((n, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, nodes.length);
    return {
      ...n,
      x: Math.round((c + radius * Math.cos(a)) * 10) / 10,
      y: Math.round((c + radius * Math.sin(a)) * 10) / 10,
      r: Math.round(8 + 10 * Math.sqrt(n.count / max)),
    };
  });
}

/** 선이 점 가장자리에서 시작·끝나도록 줄인 좌표 (화살표가 점에 가리지 않게) */
export function edgeLine(a: Placed, b: Placed): { x1: number; y1: number; x2: number; y2: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const round = (v: number) => Math.round(v * 10) / 10;
  return { x1: round(a.x + ux * a.r), y1: round(a.y + uy * a.r), x2: round(b.x - ux * (b.r + 4)), y2: round(b.y - uy * (b.r + 4)) };
}

/** 저장해 둔 관계도를 만든 뒤에 늘어난 기록 수 */
export const newSince = (savedCount: number, nowCount: number) => Math.max(0, nowCount - savedCount);
