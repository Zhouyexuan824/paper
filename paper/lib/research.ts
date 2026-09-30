import type { PaperNode, ResearchBrief, ReadingRecommendation } from './model';
export const researchRoles = [
  '技术关联',
  '同任务方法',
  '可借鉴方法',
  '后续工作候选',
] as const;
const str = (v: unknown, max = 1500) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
export function containsQuote(source: string, quote: unknown) {
  const q = str(quote, 1800);
  return q.length >= 12 && norm(source).includes(norm(q));
}
export function validateResearch(
  raw: any,
  center: PaperNode,
  candidates: PaperNode[],
  goal: string,
  model: string,
) {
  const seen = new Set<string>();
  const reading: ReadingRecommendation[] = [];
  let rejected = 0;
  for (const item of (Array.isArray(raw?.reading) ? raw.reading : []).slice(
    0,
    10,
  )) {
    if (!item || typeof item !== 'object') {
      rejected++;
      continue;
    }
    const p = candidates.find((p) => p.id === item.id);
    const centerText =
      center.kind === 'paper' ? center.abstract || '' : center.title;
    if (
      !p ||
      p.id === center.id ||
      seen.has(p.id) ||
      !researchRoles.includes(item.role) ||
      (item.role === '后续工作候选' &&
        (!p.year || !center.year || p.year < center.year)) ||
      !(center.kind === 'paper'
        ? containsQuote(centerText, item.centerEvidence)
        : typeof item.centerEvidence === 'string' &&
          norm(item.centerEvidence) === norm(center.title)) ||
      !containsQuote(p.abstract || '', item.targetEvidence)
    ) {
      rejected++;
      continue;
    }
    const reason = str(item.reason),
      difference = str(item.difference),
      question = str(item.question);
    if (!reason || !difference || !question) {
      rejected++;
      continue;
    }
    reading.push({
      id: p.id,
      title: p.title,
      role: item.role,
      reason,
      difference,
      question,
      centerEvidence: str(item.centerEvidence, 1800),
      targetEvidence: str(item.targetEvidence, 1800),
    });
    seen.add(p.id);
    if (reading.length === 6) break;
  }
  const list = (v: unknown) =>
    Array.isArray(v)
      ? v
          .map((x) => str(x, 800))
          .filter(Boolean)
          .slice(0, 5)
      : [];
  const brief: ResearchBrief = {
    goal,
    problem: str(raw?.problem),
    approach: str(raw?.approach),
    contribution: str(raw?.contribution),
    unknowns: list(raw?.unknowns),
    nextSteps: list(raw?.nextSteps),
    reading,
    inspected: candidates.length,
    abstractsRead: candidates.filter((p) => !!p.abstract).length,
    model,
    generatedAt: new Date().toISOString(),
  };
  return { brief, rejected };
}

export function evidencePassages(value: string, prefix: string) {
  return (value.match(/[^.!?]+(?:[.!?]+|$)/g) || [value])
    .map((s) => s.trim())
    .filter((s) => s.length >= 12)
    .slice(0, 24)
    .map((quote, i) => ({
      id: prefix + String(i + 1),
      quote: quote.slice(0, 1800),
    }));
}
