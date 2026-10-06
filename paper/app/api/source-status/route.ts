import { api, cached } from '@/lib/server';
import { neighbors } from '@/lib/sources';
import { seed } from '@/lib/seed';
// This route only probes fixed public papers. It never reads personal graph rows,
// accepts credentials or arbitrary URLs, or calls the paid AI endpoint.
// The deployed Site's owner-only access policy still protects the route itself.
export async function GET(req: Request) {
  return api(async () => {
    const sample = new URL(req.url).searchParams.get('sample');
    const id =
      sample === 'mamba'
        ? 'arxiv:2312.00752'
        : sample === 'samamba'
          ? 'arxiv:2505.23214'
          : 'arxiv:2408.00714';
    return cached(
      'source-health:v1:' + id,
      async () => {
        const result = await neighbors(seed.nodes.find((n) => n.id === id)!);
        return {
          paper: result.paper.label,
          sections: result.sections,
          totalReferences: result.totalReferences,
          warnings: result.warnings,
          checkedAt: new Date().toISOString(),
        };
      },
      60000,
    );
  });
}
