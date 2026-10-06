import type { PaperNode } from './model';

export type Loader = (
  url: string,
  format?: 'json' | 'xml' | 'text',
) => Promise<any>;
export type SourceSection = {
  state: 'ok' | 'partial' | 'failed' | 'unavailable';
  count: number;
  source: string;
  message?: string;
};
export type Neighborhood = {
  paper: PaperNode;
  references: PaperNode[];
  citations: PaperNode[];
  related: PaperNode[];
  warnings: string[];
  totalReferences: number | null;
  sections: {
    references: SourceSection;
    citations: SourceSection;
    related: SourceSection;
  };
  referenceSource: string;
  citationSource: string;
};
const arr = (v: any): any[] => (!v ? [] : Array.isArray(v) ? v : [v]);
const str = (v: any): string =>
  typeof v === 'string'
    ? v
    : typeof v?.['#text'] === 'string'
      ? v['#text']
      : '';
export const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const short = (s: string) =>
  s.includes(':') ? s.split(':')[0].slice(0, 45) : s.slice(0, 45);
const url = (s: unknown) => {
  try {
    const u = new URL(String(s));
    return /^https?:$/.test(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
};
export function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/\s+/g, ' ')
    .trim();
}
export function samePaper(a: PaperNode, b: PaperNode) {
  return (
    a.id === b.id ||
    !!(a.arxiv && a.arxiv === b.arxiv) ||
    !!(a.doi && b.doi && a.doi.toLowerCase() === b.doi.toLowerCase()) ||
    norm(a.title) === norm(b.title)
  );
}
export function dedupe(items: PaperNode[]) {
  const out: PaperNode[] = [];
  for (const p of items) {
    const old = out.find((x) => samePaper(x, p));
    if (!old) out.push(p);
    else
      for (const [key, value] of Object.entries(p))
        if (value && !(old as any)[key]) (old as any)[key] = value;
  }
  return out;
}
export function fromArxiv(e: any): PaperNode {
  const title = str(e.title).replace(/\s+/g, ' ').trim(),
    id = str(e.id)
      .match(/abs\/([^\s]+)/)?.[1]
      ?.replace(/v\d+$/, '');
  if (!id) throw Error('arXiv 记录缺少标识');
  const abstract = str(e.summary).replace(/\s+/g, ' ').trim();
  return {
    id: 'arxiv:' + id,
    kind: 'paper',
    label: short(title),
    title,
    arxiv: id,
    year: Number(str(e.published).slice(0, 4)) || undefined,
    venue: 'arXiv',
    abstract,
    authors: arr(e.author).map((a) => str(a.name)),
    url: 'https://arxiv.org/abs/' + id,
    provenance: 'https://arxiv.org/abs/' + id,
    ...(e.doi ? { doi: str(e.doi) } : {}),
    ...(abstract.match(/https?:\/\/github\.com\/[^\s}]+/)
      ? {
          code: url(
            abstract
              .match(/https?:\/\/github\.com\/[^\s}]+/)?.[0]
              ?.replace(/[.,;)]+$/, ''),
          ),
        }
      : {}),
  };
}
export function fromOpenAlex(w: any): PaperNode {
  const words: Record<number, string> = {};
  for (const [word, positions] of Object.entries(
    w.abstract_inverted_index || {},
  ))
    for (const p of positions as number[]) words[p] = word;
  const doi = w.doi?.replace('https://doi.org/', ''),
    title = w.title || w.display_name || '',
    arxivMatch = [
      doi || '',
      ...(w.locations || []).map((l: any) => l.landing_page_url || ''),
    ]
      .join(' ')
      .match(/(?:arxiv\.org\/abs\/|arxiv\.)(\d{4}\.\d{4,5})/i);
  return {
    id: arxivMatch
      ? 'arxiv:' + arxivMatch[1]
      : doi
        ? 'doi:' + doi.toLowerCase()
        : 'openalex:' + w.id.split('/').pop(),
    label: short(title),
    title,
    kind: 'paper',
    year: w.publication_year,
    venue:
      w.primary_location?.source?.display_name ||
      w.best_oa_location?.source?.display_name ||
      undefined,
    citedBy: Number(w.cited_by_count) || undefined,
    doi,
    arxiv: arxivMatch?.[1],
    openalex: w.id?.split('/').pop(),
    abstract: Object.keys(words)
      .sort((a, b) => +a - +b)
      .map((p) => words[+p])
      .join(' '),
    authors: (w.authorships || []).map((a: any) => a.author.display_name),
    url: url(w.doi || w.primary_location?.landing_page_url || w.id),
    provenance: w.id,
    referenceIds: w.referenced_works || [],
  };
}
export function fromCrossref(w: any): PaperNode {
  const title = arr(w.title)[0] || '',
    doi = String(w.DOI || '').toLowerCase();
  return {
    id: 'doi:' + doi,
    label: short(title),
    title,
    kind: 'paper',
    doi,
    year: w.published?.['date-parts']?.[0]?.[0],
    venue: arr(w['container-title'])[0] || undefined,
    citedBy: Number(w['is-referenced-by-count']) || undefined,
    abstract: plain(w.abstract || ''),
    authors: (w.author || []).map((a: any) =>
      [a.given, a.family].filter(Boolean).join(' '),
    ),
    url: 'https://doi.org/' + doi,
    provenance: 'https://api.crossref.org/works/' + doi,
  };
}
export function fromSemantic(w: any): PaperNode {
  const a = w.externalIds?.ArXiv,
    doi = w.externalIds?.DOI,
    title = w.title || '';
  return {
    id: a
      ? 'arxiv:' + a
      : doi
        ? 'doi:' + doi.toLowerCase()
        : 'semantic:' + w.paperId,
    label: short(title),
    title,
    kind: 'paper',
    arxiv: a,
    doi,
    semantic: w.paperId,
    year: w.year,
    venue: w.venue || undefined,
    citedBy: Number(w.citationCount) || undefined,
    abstract: w.abstract || '',
    authors: (w.authors || []).map((a: any) => a.name),
    url: url(
      w.url ||
        (a
          ? 'https://arxiv.org/abs/' + a
          : doi
            ? 'https://doi.org/' + doi
            : ''),
    ),
    provenance: 'https://www.semanticscholar.org/paper/' + w.paperId,
  };
}
async function pooled<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 3,
) {
  const out: PromiseSettledResult<R>[] = Array.from({ length: items.length });
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          out[index] = {
            status: 'fulfilled',
            value: await worker(items[index]),
          };
        } catch (reason) {
          out[index] = { status: 'rejected', reason };
        }
      }
    }),
  );
  return out;
}
const reason = (e: unknown) =>
  e instanceof Error ? e.message : '来源暂时不可用';

export function createSources(load: Loader) {
  async function arxivDetail(id: string): Promise<PaperNode> {
    try {
      const feed = await load(
        'https://export.arxiv.org/api/query?' +
          new URLSearchParams({ id_list: id }),
        'xml',
      );
      const entry = arr(feed.feed?.entry).find((e) =>
        str(e.id).includes('/abs/'),
      );
      if (entry) return fromArxiv(entry);
    } catch {
      /* Fall back to the public abstract page, never to a guessed abstract. */
    }
    const html = await load('https://arxiv.org/abs/' + id, 'text');
    function meta(name: string) {
      const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
      return tags
        .filter((t) => t.includes(`name="${name}"`))
        .map((t) => plain(t.match(/content="([^"]*)"/)?.[1] || ''));
    }
    const title = meta('citation_title')[0];
    if (!title) throw Error('arXiv 摘要页未返回论文信息');
    const abstract = plain(
      String(html).match(
        /<blockquote[^>]*class="abstract[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i,
      )?.[1] || '',
    ).replace(/^Abstract:\s*/, '');
    return {
      id: 'arxiv:' + id,
      arxiv: id,
      kind: 'paper',
      label: short(title),
      title,
      abstract,
      authors: meta('citation_author'),
      year: Number(meta('citation_date')[0]?.slice(0, 4)) || undefined,
      url: 'https://arxiv.org/abs/' + id,
      provenance: 'https://arxiv.org/abs/' + id,
    };
  }
  async function arxivSearch(q: string, limit = 6): Promise<PaperNode[]> {
    const exact = q.match(
      /^(?:https?:\/\/arxiv.org\/abs\/|arxiv:)?(\d{4}\.\d{4,5})(?:v\d+)?$/i,
    );
    if (exact) return [await arxivDetail(exact[1])];
    // An entire multi-word keyword query is not necessarily an exact phrase.
    const terms = q
      .replace(/["\\():]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 14);
    const d = await load(
      'https://export.arxiv.org/api/query?' +
        new URLSearchParams({
          search_query: terms.map((t) => `all:"${t}"`).join(' AND '),
          max_results: String(limit),
        }),
      'xml',
    );
    return arr(d.feed?.entry)
      .filter((e) => str(e.id).includes('/abs/'))
      .map(fromArxiv);
  }
  async function openalexSearch(q: string, limit = 6): Promise<PaperNode[]> {
    const doi = q.match(/(?:https?:\/\/doi.org\/)?(10\.\d{4,9}\/\S+)/i)?.[1];
    if (doi)
      return [
        fromOpenAlex(
          await load(
            'https://api.openalex.org/works/https://doi.org/' + encodeURI(doi),
          ),
        ),
      ];
    const d = await load(
      'https://api.openalex.org/works?' +
        new URLSearchParams({ search: q, 'per-page': String(limit) }),
    );
    return (d.results || []).map(fromOpenAlex);
  }
  async function crossrefSearch(q: string, limit = 6): Promise<PaperNode[]> {
    const doi = q.match(/(?:https?:\/\/doi.org\/)?(10\.\d{4,9}\/\S+)/i)?.[1];
    const d = await load(
      'https://api.crossref.org/works' +
        (doi
          ? '/' + encodeURI(doi)
          : '?' +
            new URLSearchParams({
              'query.bibliographic': q,
              rows: String(limit),
            })),
    );
    return (doi ? [d.message] : d.message?.items || [])
      .filter((w: any) => w.DOI && arr(w.title)[0])
      .map(fromCrossref);
  }
  async function semanticDetail(n: PaperNode) {
    const id =
      n.semantic ||
      (n.arxiv ? 'ARXIV:' + n.arxiv : n.doi ? 'DOI:' + n.doi : '');
    if (!id) throw Error('缺少可检索的论文标识');
    const fields =
      'title,year,venue,citationCount,abstract,externalIds,authors,url,references.title,references.year,references.externalIds,citations.title,citations.year,citations.externalIds';
    return load(
      'https://api.semanticscholar.org/graph/v1/paper/' +
        encodeURIComponent(id) +
        '?fields=' +
        fields,
    );
  }
  async function search(q: string, limit = 6) {
    const sources = [
      ['arXiv', () => arxivSearch(q, limit)],
      ['OpenAlex', () => openalexSearch(q, limit)],
    ] as const;
    const settled = await Promise.allSettled(sources.map((s) => s[1]()));
    let papers = dedupe(
      settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
    );
    const warnings = settled.flatMap((r, i) =>
      r.status === 'rejected' ? [sources[i][0] + '：' + reason(r.reason)] : [],
    );
    if (!papers.length) {
      try {
        papers = await crossrefSearch(q, limit);
      } catch (e) {
        warnings.push('Crossref：' + reason(e));
      }
    }
    if (
      !papers.length &&
      settled.every((r) => r.status === 'rejected') &&
      warnings.some((s) => s.startsWith('Crossref'))
    )
      throw Error(warnings.join('；'));
    return { papers, warnings };
  }
  async function resolve(id: string): Promise<PaperNode> {
    if (/^arxiv:\d{4}\.\d{4,5}$/.test(id)) {
      try {
        return await arxivDetail(id.slice(6));
      } catch {
        const d = await load(
          'https://api.openalex.org/works/https://doi.org/10.48550/arXiv.' +
            id.slice(6),
        );
        return fromOpenAlex(d);
      }
    }
    if (/^openalex:W\d+$/.test(id))
      return fromOpenAlex(
        await load('https://api.openalex.org/works/' + id.slice(9)),
      );
    if (id.startsWith('doi:')) {
      try {
        return (await crossrefSearch(id.slice(4)))[0];
      } catch {
        return (await openalexSearch(id.slice(4)))[0];
      }
    }
    if (/^semantic:[a-z0-9]+$/i.test(id))
      return fromSemantic(
        await semanticDetail({
          id,
          kind: 'paper',
          label: '',
          title: '',
          semantic: id.slice(9),
        }),
      );
    throw Error('无效的论文标识，请重新检索并选择论文');
  }
  async function hydrate(n: PaperNode): Promise<PaperNode> {
    const next = { ...n };
    const merge = (p: PaperNode) => {
      for (const [k, v] of Object.entries(p))
        if (v && (!(next as any)[k] || k === 'referenceIds'))
          (next as any)[k] = v;
    };
    if (n.arxiv && !n.abstract) {
      try {
        merge(await arxivDetail(n.arxiv));
      } catch {
        /* An unavailable abstract must not prevent citation lookup. */
      }
    }
    if (!next.openalex) {
      const doi =
        next.doi || (next.arxiv ? '10.48550/arXiv.' + next.arxiv : '');
      if (doi)
        try {
          merge((await openalexSearch(doi, 1))[0]);
        } catch {}
      if (!next.openalex)
        try {
          const found = await openalexSearch(next.title, 3);
          const exact = found.find((p) => samePaper(p, next));
          if (exact) merge(exact);
        } catch {}
    }
    if (!next.doi && !next.openalex)
      try {
        const found = await crossrefSearch(next.title, 3);
        const exact = found.find((p) => samePaper(p, next));
        if (exact) merge(exact);
      } catch {}
    if (
      !next.abstract &&
      next.doi &&
      !next.doi.toLowerCase().startsWith('10.48550/')
    )
      try {
        merge((await crossrefSearch(next.doi, 1))[0]);
      } catch {}
    return next;
  }
  async function neighbors(n: PaperNode): Promise<Neighborhood> {
    const paper = await hydrate(n);
    let raw: any = null;
    const problems: string[] = [];
    if (paper.openalex)
      try {
        raw = await load('https://api.openalex.org/works/' + paper.openalex);
      } catch (e) {
        problems.push(reason(e));
      }
    const ids: string[] = (raw?.referenced_works || paper.referenceIds || [])
      .slice(0, 14)
      .map((id: string) => id.split('/').pop()!);
    let referenceSource =
        raw?.id ||
        (paper.openalex ? 'https://openalex.org/' + paper.openalex : ''),
      citationSource = referenceSource;
    let totalReferences: number | null = raw
      ? raw.referenced_works?.length || 0
      : (paper.referenceIds?.length ?? null);
    async function references() {
      if (raw && ids.length === 0) return [];
      if (!ids.length) throw Error('未取得参考文献索引');
      try {
        const d = await load(
          'https://api.openalex.org/works?' +
            new URLSearchParams({
              filter: 'openalex:' + ids.join('|'),
              'per-page': '14',
            }),
        );
        return (d.results || []).map(fromOpenAlex);
      } catch {
        // Keyless list queries can fail while individual work lookups still work.
        const out = await pooled(
          ids.slice(0, 10),
          (id) =>
            load('https://api.openalex.org/works/' + id).then(fromOpenAlex),
          3,
        );
        const papers = out.flatMap((r) =>
          r.status === 'fulfilled' ? [r.value] : [],
        );
        if (!papers.length) throw Error('OpenAlex 批量与逐篇引用查询均失败');
        return papers;
      }
    }
    const tasks = await Promise.allSettled([
      references(),
      (async () => {
        if (!paper.openalex) throw Error('未取得被引用索引');
        const d = await load(
          'https://api.openalex.org/works?' +
            new URLSearchParams({
              filter: 'cites:' + paper.openalex,
              'per-page': '6',
            }),
        );
        return (d.results || []).map(fromOpenAlex);
      })(),
      search(paper.title, 5),
    ]);
    let refs: PaperNode[] =
        tasks[0].status === 'fulfilled' ? tasks[0].value : [],
      cites: PaperNode[] =
        tasks[1].status === 'fulfilled' ? tasks[1].value : [];
    let refsOk = tasks[0].status === 'fulfilled',
      citesOk = tasks[1].status === 'fulfilled';
    // Crossref references are an independent source; never label them OpenAlex.
    if (
      (!refsOk || refs.length === 0) &&
      paper.doi &&
      !paper.doi.toLowerCase().startsWith('10.48550/')
    )
      try {
        const d = await load(
          'https://api.crossref.org/works/' + encodeURI(paper.doi),
        );
        const entries = arr(d.message?.reference);
        totalReferences = entries.length;
        referenceSource = 'https://api.crossref.org/works/' + paper.doi;
        const out = await pooled(
          entries.slice(0, 14),
          async (r: any) => {
            if (r['article-title']) {
              const title = plain(r['article-title']);
              return {
                id: r.DOI
                  ? 'doi:' + String(r.DOI).toLowerCase()
                  : 'title:' + norm(title),
                doi: r.DOI,
                kind: 'paper' as const,
                title,
                label: short(title),
                year: Number(r.year) || undefined,
                url: r.DOI ? 'https://doi.org/' + r.DOI : undefined,
                provenance: referenceSource,
              };
            }
            if (r.DOI) return (await crossrefSearch(r.DOI, 1))[0];
            throw Error('参考文献缺少题名及 DOI');
          },
          3,
        );
        refs = out.flatMap((r) =>
          r.status === 'fulfilled' && r.value ? [r.value] : [],
        );
        refsOk = refs.length > 0 || entries.length === 0;
      } catch (e) {
        problems.push('Crossref：' + reason(e));
      }
    if (!refsOk || !refs.length || !citesOk)
      try {
        const data = await semanticDetail(paper);
        if (
          (!refsOk || !refs.length) &&
          Array.isArray(data.references) &&
          data.references.length
        ) {
          refs = data.references
            .filter((p: any) => p.title && p.paperId)
            .slice(0, 14)
            .map(fromSemantic);
          refsOk = true;
          totalReferences = data.references.length;
          referenceSource =
            'https://www.semanticscholar.org/paper/' + data.paperId;
        }
        if (!citesOk && Array.isArray(data.citations)) {
          cites = data.citations
            .filter((p: any) => p.title && p.paperId)
            .slice(0, 6)
            .map(fromSemantic);
          citesOk = true;
          citationSource =
            'https://www.semanticscholar.org/paper/' + data.paperId;
        }
      } catch (e) {
        problems.push('Semantic Scholar：' + reason(e));
      }
    if (!refs.length && paper.arxiv)
      try {
        const page = 'https://arxiv.org/html/' + paper.arxiv;
        const html = String(await load(page, 'text'));
        const items = [
          ...html.matchAll(
            /<li\b[^>]*class="[^"]*ltx_bibitem[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
          ),
        ];
        const parsed: PaperNode[] = [];
        for (const match of items) {
          const item = match[1],
            blocks = [
              ...item.matchAll(
                /<span\b[^>]*class="ltx_bibblock"[^>]*>([\s\S]*?)<\/span>/gi,
              ),
            ].map((m) => plain(m[1]));
          const title = blocks[1]?.replace(/\.$/, '');
          if (!title || title.length < 8) continue;
          const arxiv = item.match(
            /(?:arxiv.org\/abs\/|arxiv:)(\d{4}\.\d{4,5})/i,
          )?.[1];
          const doi = item.match(
            /https?:\/\/doi.org\/(10\.\d{4,9}\/[^"<>\s]+)/i,
          )?.[1];
          const labelText = plain(item),
            year =
              Number(labelText.match(/\((20\d{2}|19\d{2})\)/)?.[1]) ||
              undefined;
          parsed.push({
            id: arxiv
              ? 'arxiv:' + arxiv
              : doi
                ? 'doi:' + doi.toLowerCase()
                : 'title:' + norm(title),
            title,
            label: short(title),
            kind: 'paper',
            arxiv,
            doi,
            year,
            provenance: page,
            url: arxiv
              ? 'https://arxiv.org/abs/' + arxiv
              : doi
                ? 'https://doi.org/' + doi
                : undefined,
          });
        }
        if (parsed.length) {
          refs = parsed.slice(0, 14);
          refsOk = true;
          totalReferences = items.length;
          referenceSource = page;
        }
      } catch (e) {
        problems.push('arXiv 参考文献：' + reason(e));
      }
    const related =
      tasks[2].status === 'fulfilled'
        ? tasks[2].value.papers.filter((p) => !samePaper(p, paper))
        : [];
    const sections = {
      references: {
        state: refsOk ? (refs.length ? 'ok' : 'unavailable') : 'failed',
        count: refs.length,
        source: referenceSource,
        message: refsOk ? undefined : '参考文献来源未能返回记录',
      } as SourceSection,
      citations: {
        state: citesOk ? 'ok' : 'failed',
        count: cites.length,
        source: citationSource,
        message: citesOk ? undefined : '被引用索引暂时不可用',
      } as SourceSection,
      related: {
        state: tasks[2].status === 'fulfilled' ? 'ok' : 'failed',
        count: related.length,
        source: '多源题名检索',
      } as SourceSection,
    };
    const warnings = Object.entries(sections)
      .filter(([, s]) => s.state === 'failed' || s.state === 'unavailable')
      .map(
        ([k]) =>
          ({
            references: '参考文献',
            citations: '被引用论文',
            related: '相关论文',
          })[k] + '暂时获取失败',
      );
    if (warnings.length)
      console.warn(
        'PaperAtlas sources',
        JSON.stringify({
          paper: paper.id,
          failed: warnings,
          details: problems,
        }),
      );
    return {
      paper,
      references: dedupe(refs),
      citations: dedupe(cites),
      related: dedupe(related),
      totalReferences,
      sections,
      warnings,
      referenceSource,
      citationSource,
    };
  }
  return {
    arxivSearch,
    openalexSearch,
    crossrefSearch,
    search,
    hydrate,
    neighbors,
    resolve,
  };
}
