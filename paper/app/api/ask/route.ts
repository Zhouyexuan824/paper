import { api, owner, rate, jsonBody, text, node, ApiError } from '@/lib/server';
import { askPaper } from '@/lib/ai';

export async function POST(req: Request) {
  return api(async () => {
    const user = owner(req);
    await rate(user, 'paper-ask', 30);
    const body = await jsonBody(req);
    const id = text(body?.id, 500);
    const question = text(body?.question, 2000);
    if (!question) throw new ApiError('请输入你想了解的问题。');
    const paper = await node(user, id);
    if (paper.kind !== 'paper')
      throw new ApiError('AI 问答目前只支持论文节点。', 422);
    if (!paper.abstract && !paper.summary)
      throw new ApiError('这篇论文还没有摘要或分析信息，请先补充论文摘要。', 422);
    return askPaper(paper, question);
  });
}
