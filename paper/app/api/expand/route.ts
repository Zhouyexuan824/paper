import {
  api,
  owner,
  rate,
  jsonBody,
  text,
  node,
  merge,
  graph,
  ApiError,
} from '@/lib/server';
import { neighbors } from '@/lib/sources';
import { citationGraph } from '@/lib/expansion';
export async function POST(req: Request) {
  return api(async () => {
    const user = owner(req);
    await rate(user, 'expand', 60);
    const { id } = await jsonBody(req);
    const current = await node(user, text(id, 500));
    if (current.kind !== 'paper')
      throw new ApiError('方法、领域和数据集请使用“以此为中心 · AI 扩展”。');
    const result = await neighbors(current);
    if (
      Object.values(result.sections).every(
        (s) => s.state === 'failed' || s.state === 'unavailable',
      )
    )
      throw new ApiError(
        '引用与相关论文来源均未能返回结果，本次没有添加关系。请重试或使用“以此为中心 · AI 扩展”。',
        502,
      );
    const before = await graph(user);
    const saved = await merge(user, citationGraph(current, result));
    return {
      ...saved,
      warnings: result.warnings,
      sections: result.sections,
      totalReferences: result.totalReferences,
      loadedReferences: result.references.length,
      loadedCitations: result.citations.length,
      loadedRelated: result.related.length,
      addedNodes: saved.graph.nodes.length - before.nodes.length,
      addedEdges: saved.graph.edges.length - before.edges.length,
    };
  });
}
