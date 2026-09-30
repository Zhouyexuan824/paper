import { api, owner, init, graph } from '@/lib/server';
import { getAIConfig } from '@/lib/ai';
export async function GET(req: Request) {
  return api(async () => {
    const user = owner(req);
    await init(user);
    const ai = getAIConfig();
    return {
      ...(await graph(user)),
      aiConfigured: !!ai,
      aiProvider: ai?.label || '',
      aiModel: ai?.model || '',
    };
  });
}
