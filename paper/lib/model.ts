export type NodeKind = 'paper' | 'method' | 'field' | 'dataset';
export type RelationStatus = 'verified' | 'candidate' | 'manual';
export interface ReadingRecommendation {
  id: string;
  title: string;
  role: string;
  reason: string;
  difference: string;
  question: string;
  centerEvidence: string;
  targetEvidence: string;
}
export interface ResearchBrief {
  goal: string;
  problem: string;
  approach: string;
  contribution: string;
  unknowns: string[];
  nextSteps: string[];
  reading: ReadingRecommendation[];
  inspected: number;
  abstractsRead: number;
  model: string;
  generatedAt: string;
}
export interface PaperNode {
  id: string;
  label: string;
  title: string;
  kind: NodeKind;
  year?: number;
  venue?: string;
  citedBy?: number;
  abstract?: string;
  summary?: string;
  url?: string;
  doi?: string;
  arxiv?: string;
  openalex?: string;
  semantic?: string;
  authors?: string[];
  code?: string;
  datasets?: string;
  experiments?: string;
  notes?: string;
  x?: number;
  y?: number;
  research?: ResearchBrief;
  provenance?: string;
  analyzed?: boolean;
  referenceIds?: string[];
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  description: string;
  evidence: string;
  sourceUrl: string;
  status: RelationStatus;
  origin: 'seed' | 'ai' | 'index' | 'manual';
}
export interface Graph {
  nodes: PaperNode[];
  edges: GraphEdge[];
}
export const kindNames: Record<NodeKind, string> = {
  paper: '论文',
  method: '方法模块',
  field: '研究领域',
  dataset: '数据集',
};
export const relationNames = [
  '使用方法',
  '提出模块',
  '研究领域',
  '实验数据集',
  '引用',
  '对比方法',
  '直接 baseline',
  '方法借鉴',
  '相关工作',
  '技术关联',
  '同任务方法',
  '可借鉴方法',
  '后续工作候选',
  '自定义',
];
export function cleanUrl(value: unknown): string {
  try {
    const u = new URL(String(value));
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}
