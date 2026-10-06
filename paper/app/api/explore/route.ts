import {
  api,
  owner,
  rate,
  jsonBody,
  text,
  node,
  merge,
  graph,
  updateNode,
} from '@/lib/server';
import { explore } from '@/lib/expansion';
export async function POST(req: Request) {
  return api(async () => {
    const user = owner(req);
    await rate(user, 'ai', 30);
    const { id, goal } = await jsonBody(req);
    const center = await node(user, text(id, 500));
    const before = await graph(user);
    const result = await explore(center, before, text(goal, 500));
    const saved = await merge(user, result.graph);
    const brief = [...result.graph.nodes]
      .reverse()
      .find((n) => n.id === center.id && n.research)?.research;
    if (brief) {
      const canonical = {
        ...brief,
        reading: brief.reading.map((r) => ({
          ...r,
          id: saved.ids[r.id] || r.id,
        })),
      };
      await updateNode(user, center.id, { research: canonical });
      saved.graph = await graph(user);
    }
    return {
      ...saved,
      centerId: center.id,
      queries: result.queries,
      warnings: result.warnings,
      model: result.model,
      sections: result.sections,
      aiRelations: result.aiRelations,
      relatedPapers: result.relatedPapers,
      addedNodes: saved.graph.nodes.length - before.nodes.length,
      addedEdges: saved.graph.edges.length - before.edges.length,
    };
  });
}
