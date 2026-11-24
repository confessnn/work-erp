// 노트 그래프: [[링크]]로 이어진 노트를 점과 선으로 (순수 함수). 옵시디언 그래프 뷰처럼 힘으로 배치한다.
import { linkResolver, type Section } from "./vault";

export type NoteRef = { id: string; path: string; title: string; section: Section; links: string[] };
/** ghost: 볼트에 아직 없는 노트 (링크만 있음). 옵시디언처럼 흐리게 그린다 */
export type BrainNode = { id: string; title: string; section: Section; degree: number; ghost?: boolean };
export const GHOST_PREFIX = "ghost:";
export type BrainEdge = { from: string; to: string };

/** 그림에 넣는 최대 노트 수 (연결이 많은 노트부터) */
export const MAX_GRAPH_NODES = 150;

/**
 * 링크로 이어진 노트만 모아 점·선을 만든다. 같은 두 노트 사이 선은 하나.
 * 없는 노트로 가는 링크는, 두 노트 이상이 가리킬 때만 흐린 점으로 넣는다 (예: ERP 기록의 [[기관]])
 */
export function buildBrainGraph(notes: NoteRef[], max = MAX_GRAPH_NODES): { nodes: BrainNode[]; edges: BrainEdge[]; alone: number; truncated: boolean } {
  const resolve = linkResolver(notes);
  const ghostRefs = new Map<string, Set<string>>();
  for (const n of notes) for (const k of n.links) if (!resolve(k)) ghostRefs.set(k, (ghostRefs.get(k) ?? new Set()).add(n.id));
  const ghosts = new Map(
    [...ghostRefs].filter(([, refs]) => refs.size >= 2).map(([k]) => [k, { id: `${GHOST_PREFIX}${k}`, title: k.split("/").pop()! }]),
  );
  const seen = new Set<string>();
  const edges: BrainEdge[] = [];
  for (const n of notes) {
    for (const k of n.links) {
      const to = resolve(k) ?? ghosts.get(k);
      if (!to || to.id === n.id) continue;
      const pair = [n.id, to.id].sort().join("|");
      if (seen.has(pair)) continue;
      seen.add(pair);
      edges.push({ from: n.id, to: to.id });
    }
  }
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const all: (NoteRef | { id: string; title: string; section: Section; ghost: true })[] = [
    ...notes,
    ...[...ghosts.values()].map((g) => ({ ...g, section: "other" as const, ghost: true as const })),
  ];
  const connected = all
    .filter((n) => degree.has(n.id))
    .sort((a, b) => degree.get(b.id)! - degree.get(a.id)! || a.title.localeCompare(b.title));
  const truncated = connected.length > max;
  connected.splice(max);
  const keep = new Set(connected.map((n) => n.id));
  return {
    nodes: connected.map((n) => ({
      id: n.id,
      title: n.title,
      section: n.section,
      degree: degree.get(n.id)!,
      ...("ghost" in n ? { ghost: true } : {}),
    })),
    edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    alone: notes.filter((n) => !degree.has(n.id)).length,
    truncated,
  };
}

export type PlacedNode = BrainNode & { x: number; y: number; r: number };

/**
 * 힘 배치: 모든 점은 서로 밀고, 선으로 이어진 점은 당기고, 가운데로 살짝 끈다.
 * 같은 입력이면 항상 같은 그림 (난수 없이 원 둘레에서 시작).
 */
export function forceLayout(nodes: BrainNode[], edges: BrainEdge[], size: number, iterations = 250): PlacedNode[] {
  const n = nodes.length;
  if (!n) return [];
  const c = size / 2;
  const idx = new Map(nodes.map((v, i) => [v.id, i]));
  const xs = nodes.map((_, i) => c + size * 0.3 * Math.cos((2 * Math.PI * i) / n) * (0.6 + 0.4 * ((i * 7) % 5) / 4));
  const ys = nodes.map((_, i) => c + size * 0.3 * Math.sin((2 * Math.PI * i) / n) * (0.6 + 0.4 * ((i * 7) % 5) / 4));
  const k = Math.sqrt((size * size * 0.5) / n); // 이상적인 간격
  const links = edges.map((e) => [idx.get(e.from)!, idx.get(e.to)!] as const);

  for (let it = 0; it < iterations; it++) {
    const temp = (size / 10) * (1 - it / iterations) + 0.5;
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = xs[i] - xs[j];
        let ddy = ys[i] - ys[j];
        let d = Math.hypot(ddx, ddy);
        if (d < 0.01) {
          ddx = 0.01 * (i - j);
          ddy = 0.01;
          d = Math.hypot(ddx, ddy);
        }
        const f = (k * k) / d;
        dx[i] += (ddx / d) * f;
        dy[i] += (ddy / d) * f;
        dx[j] -= (ddx / d) * f;
        dy[j] -= (ddy / d) * f;
      }
    }
    for (const [a, b] of links) {
      const ddx = xs[a] - xs[b];
      const ddy = ys[a] - ys[b];
      const d = Math.hypot(ddx, ddy) || 0.01;
      const f = (d * d) / k;
      dx[a] -= (ddx / d) * f;
      dy[a] -= (ddy / d) * f;
      dx[b] += (ddx / d) * f;
      dy[b] += (ddy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      dx[i] += (c - xs[i]) * 0.05 * k * 0.1;
      dy[i] += (c - ys[i]) * 0.05 * k * 0.1;
      const d = Math.hypot(dx[i], dy[i]) || 1;
      xs[i] += (dx[i] / d) * Math.min(d, temp);
      ys[i] += (dy[i] / d) * Math.min(d, temp);
    }
  }

  // 그림 안에 꽉 차게 맞춘다 (가장자리 여백)
  const pad = 40;
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((size - 2 * pad) / Math.max(1, maxX - minX), (size - 2 * pad) / Math.max(1, maxY - minY));
  const maxDeg = Math.max(1, ...nodes.map((v) => v.degree));
  const round = (v: number) => Math.round(v * 10) / 10;
  return nodes.map((v, i) => ({
    ...v,
    x: n === 1 ? c : round(c + (xs[i] - (minX + maxX) / 2) * scale),
    y: n === 1 ? c : round(c + (ys[i] - (minY + maxY) / 2) * scale),
    r: Math.round(4 + 8 * Math.sqrt(v.degree / maxDeg)),
  }));
}
