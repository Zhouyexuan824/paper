import type { Graph, GraphEdge, NodeKind } from './model';
export type RelationScope =
  | 'insight'
  | 'all'
  | 'references'
  | 'citations'
  | 'methods'
  | 'datasets'
  | 'related';
export const scopeLabels: Record<RelationScope, string> = {
  insight: '研究脉络',
  all: '全部关系',
  references: '参考文献',
  citations: '被引用',
  methods: '方法与领域',
  datasets: '数据集',
  related: '相关论文',
};
export function graphView(
  graph: Graph,
  focus: string | null,
  options: {
    scope?: RelationScope;
    confirmed?: boolean;
    hidden?: NodeKind[];
    limit?: number;
  } = {},
) {
  const {
    scope = 'all',
    confirmed = false,
    hidden = [],
    limit = Infinity,
  } = options;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  let edges = graph.edges.filter((e) => {
    if (!byId.has(e.source) || !byId.has(e.target)) return false;
    if (focus && e.source !== focus && e.target !== focus) return false;
    if (confirmed && e.status === 'candidate') return false;
    if (
      [e.source, e.target].some(
        (id) => id !== focus && hidden.includes(byId.get(id)!.kind),
      )
    )
      return false;
    if (scope === 'insight') {
      if (e.type === '引用') return false;
      const brief = focus ? byId.get(focus)?.research : null;
      const other = byId.get(e.source === focus ? e.target : e.source);
      if (brief && other?.kind === 'paper' && e.origin === 'ai')
        return (
          brief.reading.some((r) => r.id === other.id) ||
          ['使用方法', '方法借鉴'].includes(e.type)
        );
      return e.origin !== 'index';
    }
    if (scope === 'references')
      return e.type === '引用' && (!focus || e.source === focus);
    if (scope === 'citations')
      return e.type === '引用' && (!focus || e.target === focus);
    if (scope === 'methods')
      return [
        '使用方法',
        '提出模块',
        '研究领域',
        '对比方法',
        '直接 baseline',
        '方法借鉴',
        '技术关联',
        '可借鉴方法',
      ].includes(e.type);
    if (scope === 'datasets') return e.type === '实验数据集';
    if (scope === 'related') {
      if (e.type === '引用') return false;
      if (focus) {
        const other = e.source === focus ? e.target : e.source;
        return byId.get(other)?.kind === 'paper';
      }
      return (
        byId.get(e.source)?.kind === 'paper' &&
        byId.get(e.target)?.kind === 'paper'
      );
    }
    return true;
  });
  const ids = new Set(edges.flatMap((e) => [e.source, e.target]));
  const priority = (id: string) =>
    edges.filter(
      (e) => (e.source === id || e.target === id) && e.status !== 'candidate',
    ).length;
  const citationImpact = (id: string) => byId.get(id)?.citedBy || 0;
  const candidates = graph.nodes
    .filter(
      (n) =>
        n.id !== focus &&
        (focus || scope !== 'all' || confirmed
          ? ids.has(n.id)
          : !hidden.includes(n.kind)),
    )
    .sort(
      (a, b) => {
        if (scope === 'references') {
          const impactOrder = citationImpact(b.id) - citationImpact(a.id);
          if (impactOrder) return impactOrder;
        }
        return (
          priority(b.id) - priority(a.id) ||
          a.kind.localeCompare(b.kind) ||
          a.label.localeCompare(b.label) ||
          a.id.localeCompare(b.id)
        );
      },
    );
  const scopedCandidates =
    scope === 'methods'
      ? candidates.filter(
          (node) =>
            node.id === focus ||
            node.kind === 'method' ||
            node.kind === 'field',
        )
      : candidates;
  const total = scopedCandidates.length;
  const nodes = focus
    ? [byId.get(focus), ...scopedCandidates.slice(0, limit)].filter(
        (n): n is Graph['nodes'][number] => !!n,
      )
    : scopedCandidates;
  const shown = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => shown.has(e.source) && shown.has(e.target));
  return {
    graph: { nodes, edges },
    total,
    omitted: focus ? Math.max(0, total - limit) : 0,
  };
}
export function relationCurve(
  e: GraphEdge,
  edges: GraphEdge[],
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const group = edges
    .filter(
      (x) =>
        [x.source, x.target].sort().join('|') ===
        [e.source, e.target].sort().join('|'),
    )
    .sort((x, y) => x.id.localeCompare(y.id));
  const offset =
    (group.findIndex((x) => x.id === e.id) - (group.length - 1) / 2) *
    54 *
    (e.source < e.target ? 1 : -1);
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy) || 1;
  const cx = (a.x + b.x) / 2 - (dy / length) * offset,
    cy = (a.y + b.y) / 2 + (dx / length) * offset;
  const start = Math.hypot(cx - a.x, cy - a.y) || 1,
    end = Math.hypot(b.x - cx, b.y - cy) || 1;
  const sx = a.x + ((cx - a.x) / start) * 43,
    sy = a.y + ((cy - a.y) / start) * 43;
  const ex = b.x - ((b.x - cx) / end) * 38,
    ey = b.y - ((b.y - cy) / end) * 38;
  return {
    path: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`,
    x: (sx + 2 * cx + ex) / 4,
    y: (sy + 2 * cy + ey) / 4,
  };
}
