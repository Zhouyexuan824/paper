import {
  api,
  owner,
  init,
  rate,
  text,
  ApiError,
  jsonBody,
  merge,
} from '@/lib/server';
import { resolve } from '@/lib/sources';
export async function POST(req: Request) {
  return api(async () => {
    const user = owner(req);
    await init(user);
    await rate(user, 'add', 100);
    const body = await jsonBody(req);
    const id = text(body.id, 500);
    let paper;
    try {
      paper = await resolve(id);
    } catch (e) {
      throw new ApiError(e instanceof Error ? e.message : '论文读取失败', 502);
    }
    if (!paper) throw new ApiError('未能读取该论文。', 404);
    return {
      ...(await merge(user, { nodes: [paper], edges: [] })),
      addedId: paper.id,
    };
  });
}
