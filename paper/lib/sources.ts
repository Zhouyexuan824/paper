import { env } from 'cloudflare:workers';
import { XMLParser } from 'fast-xml-parser';
import { ApiError, cached } from './server';
import { createSources } from './providers';
const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
export async function remote(
  url: string,
  format: 'json' | 'xml' | 'text' = 'json',
) {
  return cached('source:v3:' + url, async () => {
    const host = new URL(url).hostname;
    const headers: Record<string, string> = {
      'User-Agent': 'PaperAtlas/1.1 (academic metadata discovery)',
    };
    if (host === 'api.openalex.org' && env.OPENALEX_API_KEY)
      headers.Authorization = 'Bearer ' + env.OPENALEX_API_KEY;
    if (host === 'api.semanticscholar.org' && env.SEMANTIC_SCHOLAR_API_KEY)
      headers['x-api-key'] = env.SEMANTIC_SCHOLAR_API_KEY;
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(12000),
        });
      } catch {
        if (!attempt) continue;
        console.warn('Metadata source timeout', host);
        throw new ApiError(host + ' 连接超时', 502);
      }
      if (!response.ok) {
        const retry = Number(response.headers.get('retry-after') || '0');
        await response.body?.cancel();
        if (
          attempt === 0 &&
          (response.status >= 500 || (response.status === 429 && retry <= 2))
        ) {
          await new Promise((r) =>
            setTimeout(r, Math.min(1500, retry * 1000 || 400)),
          );
          continue;
        }
        console.warn(
          'Metadata source HTTP',
          host,
          new URL(url).pathname,
          response.status,
        );
        throw new ApiError(
          host +
            ' 返回 ' +
            response.status +
            (response.status === 429
              ? '（限流）'
              : response.status === 401
                ? '（需要数据源密钥）'
                : ''),
          502,
        );
      }
      if (format === 'text') return response.text();
      if (format === 'xml') return xml.parse(await response.text());
      return response.json();
    }
    throw new ApiError('论文数据源暂时不可用', 502);
  });
}
export const {
  arxivSearch,
  openalexSearch,
  crossrefSearch,
  search,
  hydrate,
  neighbors,
  resolve,
} = createSources(remote);
