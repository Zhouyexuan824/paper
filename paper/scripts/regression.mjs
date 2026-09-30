import assert from 'node:assert/strict';
import { createSources } from '../lib/providers.ts';
import { centeredNodes, CENTER } from '../lib/layout.ts';
const center = {
  id: 'doi:10.1000/root',
  doi: '10.1000/root',
  openalex: 'W1',
  kind: 'paper',
  title: 'Root paper',
  label: 'Root',
};
const raw = {
  id: 'https://openalex.org/W1',
  title: 'Root paper',
  doi: 'https://doi.org/10.1000/root',
  referenced_works: ['https://openalex.org/W2'],
};
const calls = [];
const singles = createSources(async (url) => {
  calls.push(url);
  const u = new URL(url);
  if (u.hostname === 'api.openalex.org' && u.pathname.endsWith('/W1'))
    return raw;
  if (u.hostname === 'api.openalex.org' && u.pathname.endsWith('/W2'))
    return {
      id: 'https://openalex.org/W2',
      title: 'Reference paper',
      doi: 'https://doi.org/10.1000/ref',
    };
  throw Error('HTTP 429 fixture');
});
let result = await singles.neighbors(center);
assert.equal(result.references.length, 1);
assert.equal(result.sections.references.state, 'ok');
assert(
  calls.some((u) => u.endsWith('/W2')),
  'batch failure falls back to individual work',
);
assert.equal(result.sections.citations.state, 'failed');
const cross = createSources(async (url) => {
  if (url === 'https://api.crossref.org/works/10.1000/root')
    return {
      message: {
        reference: [
          {
            'article-title': 'Crossref reference',
            DOI: '10.1000/other',
            year: '2020',
          },
        ],
      },
    };
  throw Error('HTTP 401 fixture');
});
result = await cross.neighbors(center);
assert.equal(result.references[0].title, 'Crossref reference');
assert(result.referenceSource.includes('api.crossref.org'));
assert.equal(result.sections.references.state, 'ok');
assert.equal(result.sections.related.state, 'failed');
const failure = createSources(async () => {
  throw Error('network unavailable fixture');
});
result = await failure.neighbors(center);
assert(Object.values(result.sections).every((s) => s.state === 'failed'));
assert.equal(result.references.length, 0);
assert.equal(result.citations.length, 0);
assert.equal(result.related.length, 0);
const hydrate = createSources(async (url) => {
  if (
    url.startsWith('https://api.openalex.org/works/https://doi.org/10.48550/')
  )
    return {
      id: 'https://openalex.org/W3',
      title: 'SAM 2: Segment Anything in Images and Videos',
      doi: 'https://doi.org/10.48550/arxiv.2408.00714',
      abstract_inverted_index: { Known: [0], abstract: [1] },
      referenced_works: [],
    };
  throw Error('arXiv unavailable fixture');
});
const hydrated = await hydrate.hydrate({
  id: 'arxiv:2408.00714',
  arxiv: '2408.00714',
  kind: 'paper',
  title: 'SAM 2: Segment Anything in Images and Videos',
  label: 'SAM 2',
});
assert.equal(hydrated.openalex, 'W3');
assert.equal(
  hydrated.abstract,
  'Known abstract',
  'arXiv outage does not block metadata hydration',
);
const other = {
  id: 'other',
  kind: 'dataset',
  label: 'Data',
  title: 'Data',
  x: 9000,
  y: 9000,
};
const g = {
  nodes: [
    { ...center, x: -999, y: -999 },
    other,
    { id: 'unrelated', kind: 'paper', title: 'Unrelated', label: 'Unrelated' },
  ],
  edges: [{ id: 'e', source: center.id, target: other.id }],
};
const laid = centeredNodes(g, center.id);
assert.equal(laid.length, 2);
assert.deepEqual({ x: laid[0].x, y: laid[0].y }, CENTER);
assert.equal(
  g.nodes[0].x,
  -999,
  'centering never overwrites persistent full-graph positions',
);
assert.equal(
  centeredNodes(g, other.id)[0].id,
  other.id,
  'any kind can be the center',
);
assert.equal(
  centeredNodes(g, center.id, ['paper'])[0].id,
  center.id,
  'center stays visible regardless of type filter',
);
console.log(
  'PASS: list API failure -> per-work lookup; independent Crossref fallback; complete outage classified as failure; arXiv outage -> DOI resolution; centered layout; any-node centering; non-destructive positions',
);
const withEmptyIndex = createSources(async (url) => {
  if (url.endsWith('/W1')) return { ...raw, referenced_works: [] };
  if (url.includes('api.semanticscholar.org'))
    return {
      paperId: 'root',
      references: [
        {
          paperId: 'ref',
          title: 'Semantic fallback reference',
          externalIds: { ArXiv: '2401.00001' },
        },
      ],
      citations: [],
    };
  throw Error('fixture list unavailable');
});
result = await withEmptyIndex.neighbors(center);
assert.equal(
  result.references.length,
  1,
  'an empty OpenAlex reference list must still try another source',
);
assert(result.referenceSource.includes('semanticscholar'));
console.log(
  'PASS: empty citation index is not treated as proof of zero references',
);
