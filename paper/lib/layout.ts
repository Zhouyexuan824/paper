import type { Graph, PaperNode, NodeKind } from './model';
export const CENTER = { x: 500, y: 350 };
export function centeredNodes(
  graph: Graph,
  focus: string,
  hidden: NodeKind[] = [],
): PaperNode[] {
  const center = graph.nodes.find((n) => n.id === focus);
  if (!center) return [];
  const adjacent = new Set(
    graph.edges
      .filter((e) => e.source === focus || e.target === focus)
      .flatMap((e) => [e.source, e.target]),
  );
  const others = graph.nodes
    .filter(
      (n) => n.id !== focus && adjacent.has(n.id) && !hidden.includes(n.kind),
    )
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );
  const result: PaperNode[] = [{ ...center, ...CENTER }];
  for (let start = 0, ring = 0; start < others.length; ring++) {
    const count = Math.min(10 + ring * 6, others.length - start),
      radius = 225 + ring * 180;
    for (let j = 0; j < count; j++) {
      const angle = -Math.PI / 2 + (2 * Math.PI * j) / count;
      result.push({
        ...others[start + j],
        x: CENTER.x + Math.cos(angle) * radius,
        y: CENTER.y + Math.sin(angle) * radius,
      });
    }
    start += count;
  }
  return result;
}
