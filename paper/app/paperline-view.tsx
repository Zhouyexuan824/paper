'use client';

import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Code2,
  Database,
  LoaderCircle,
  Network,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Graph, GraphEdge, PaperNode } from '@/lib/model';
import { cleanUrl } from '@/lib/model';
import ResearchBriefPanel from './research-brief';

type Props = {
  graph: Graph;
  node?: PaperNode;
  query: string;
  results: PaperNode[];
  searched: boolean;
  searching: boolean;
  warning: string;
  busy: boolean;
  ready: boolean;
  ai: boolean;
  aiProvider: string;
  onQuery: (value: string) => void;
  onSearch: () => void;
  onOrganize: (paper: PaperNode) => void;
  onAdd: (paper: PaperNode) => void;
  onVisit: (id: string) => void;
  onGraph: (id?: string) => void;
  onExplore: (id: string) => void;
};

const relationGroups = {
  foundation: new Set([
    '引用',
    '使用方法',
    '方法借鉴',
    '技术关联',
    '直接 baseline',
    '对比方法',
  ]),
  followup: new Set(['后续工作候选']),
};

function Link({ href, children }: { href?: string; children: React.ReactNode }) {
  const url = cleanUrl(href);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : null;
}

function RelatedCard({
  paper,
  edge,
  onVisit,
}: {
  paper: PaperNode;
  edge: GraphEdge;
  onVisit: (id: string) => void;
}) {
  return (
    <article className="lineage-paper-card">
      <div className="lineage-paper-meta">
        <span>{edge.type}</span>
        <small>{paper.year || '年份未知'}</small>
        <small>{edge.status === 'verified' ? '来源支持' : edge.status === 'manual' ? '人工确认' : '待核验'}</small>
      </div>
      <h3>{paper.title}</h3>
      {paper.authors?.length ? <p className="lineage-authors">{paper.authors.slice(0, 4).join(', ')}</p> : null}
      <p>{edge.description || edge.evidence || paper.abstract?.slice(0, 180) || '已加入个人论文图谱。'}</p>
      <div className="lineage-card-actions">
        <Link href={paper.url}>查看论文 <ArrowUpRight size={13} /></Link>
        <button onClick={() => onVisit(paper.id)}>围绕此论文继续 <ArrowRight size={13} /></button>
      </div>
    </article>
  );
}

export default function PaperlineView(props: Props) {
  const node = props.node?.kind === 'paper' ? props.node : undefined;
  const direct = node
    ? props.graph.edges
        .filter((edge) => edge.source === node.id || edge.target === node.id)
        .map((edge) => ({
          edge,
          paper: props.graph.nodes.find(
            (item) => item.id === (edge.source === node.id ? edge.target : edge.source),
          ),
        }))
        .filter((item): item is { edge: GraphEdge; paper: PaperNode } => !!item.paper && item.paper.kind === 'paper')
    : [];
  const foundations = direct.filter(({ edge }) =>
    edge.target !== node?.id && relationGroups.foundation.has(edge.type),
  );
  const followups = direct.filter(
    ({ edge }) => edge.target === node?.id || relationGroups.followup.has(edge.type),
  );
  const peers = direct.filter(
    ({ edge }) => !foundations.some((item) => item.edge.id === edge.id) && !followups.some((item) => item.edge.id === edge.id),
  );

  return (
    <main className="paperline-shell">
      <section className="paperline-hero">
        <div className="paperline-kicker"><Sparkles size={14} /> PAPERLINE × PAPER ATLAS</div>
        <h1>从一篇论文，整理出完整研究脉络</h1>
        <p>检索真实论文，AI 归纳前置方法、同任务工作和后续研究，并保存到可编辑的个人关系图谱。</p>
        <form
          className="paperline-search"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSearch();
          }}
        >
          <Search size={22} />
          <input
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
            placeholder="输入论文标题、简称、arXiv ID 或 DOI，例如 SAMamba"
            aria-label="论文检索词"
          />
          <Button type="submit" disabled={!props.ready || props.searching || props.busy}>
            {props.searching ? <LoaderCircle className="spin" /> : <Sparkles />}
            智能整理
          </Button>
        </form>
        <div className="paperline-status">
          <span>{props.ai ? `${props.aiProvider} 已连接` : 'AI 尚未连接'}</span>
          <span>arXiv · OpenAlex · Crossref</span>
          <span>{props.graph.nodes.filter((item) => item.kind === 'paper').length} 篇已收藏</span>
        </div>
      </section>

      {props.warning && <p className="paperline-warning">{props.warning}</p>}
      {(props.searching || props.results.length > 0 || (props.searched && !props.results.length)) && (
        <section className="paperline-results">
          <div className="paperline-section-title"><span>00</span><h2>选择准确的论文</h2><small>先核对题名，再生成脉络</small></div>
          {props.searching ? (
            <div className="paperline-loading"><LoaderCircle className="spin" /> 正在查询多个学术来源…</div>
          ) : props.results.length ? (
            <div className="paperline-search-grid">
              {props.results.map((paper) => {
                const saved = props.graph.nodes.some((item) => item.id === paper.id);
                return (
                  <article key={paper.id} className="paperline-search-card">
                    <div><span>{[paper.year || '年份未知', paper.venue].filter(Boolean).join(' · ')}</span>{paper.citedBy ? <span>被引 {paper.citedBy}</span> : null}{saved && <b>已收藏</b>}</div>
                    <h3>{paper.title}</h3>
                    <p>{paper.abstract?.slice(0, 230) || '该来源暂未提供摘要。'}</p>
                    <div className="paperline-card-actions">
                      <Link href={paper.url}>原始来源 <ArrowUpRight size={13} /></Link>
                      <Button variant="outline" onClick={() => props.onAdd(paper)} disabled={props.busy}><Plus />仅收藏</Button>
                      <Button onClick={() => props.onOrganize(paper)} disabled={props.busy || !props.ai}><Sparkles />整理并绘图</Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="paperline-empty">没有找到匹配论文，请尝试完整英文题名或 DOI。</div>
          )}
        </section>
      )}

      {node && (
        <section className="lineage-report">
          <div className="lineage-report-head">
            <div>
              <span>当前研究对象</span>
              <h2>{node.title}</h2>
              <p>{[node.year, node.venue, node.citedBy ? `被引 ${node.citedBy}` : '', node.authors?.slice(0, 4).join(', ')].filter(Boolean).join(' · ')}</p>
            </div>
            <div>
              <Button variant="outline" onClick={() => props.onExplore(node.id)} disabled={props.busy || !props.ai}><Sparkles />重新整理</Button>
              <Button onClick={() => props.onGraph(node.id)}><Network />进入可编辑图谱</Button>
            </div>
          </div>

          <div className="paperline-section-title"><span>01</span><h2>研究摘要与方法路线</h2><small>AI 结论基于可取得的摘要</small></div>
          <div className="lineage-summary-grid">
            <article><strong>论文摘要</strong><p>{node.summary || node.abstract || '摘要尚未取得，可进入图谱后手动补充。'}</p></article>
            <article><strong>实验与资源</strong><p>{node.experiments || '实验结构尚待从全文补充。'}</p>{node.datasets && <p><Database size={14} /> {node.datasets}</p>}{node.code && <Link href={node.code}><Code2 size={14} /> 打开代码仓库</Link>}</article>
          </div>

          {node.research && <ResearchBriefPanel node={node} graph={props.graph} onVisit={props.onVisit} />}

          <div className="paperline-section-title"><span>02</span><h2>核心 Baseline 与前置方法</h2><small>引用不自动等于 Baseline，请核对证据</small></div>
          <div className="lineage-list">{foundations.length ? foundations.map((item) => <RelatedCard key={item.edge.id} {...item} onVisit={props.onVisit} />) : <div className="paperline-empty">尚未整理出前置论文。点击“重新整理”或进入图谱展开参考文献。</div>}</div>

          <div className="paperline-section-title"><span>03</span><h2>重要后续与引用工作</h2><small>被引用论文与后续候选</small></div>
          <div className="lineage-list">{followups.length ? followups.map((item) => <RelatedCard key={item.edge.id} {...item} onVisit={props.onVisit} />) : <div className="paperline-empty">尚未加载后续工作，可进入图谱使用“展开引用与相关论文”。</div>}</div>

          <div className="paperline-section-title"><span>04</span><h2>同期 / 同任务方法</h2><small>用于比较不同技术路线</small></div>
          <div className="lineage-list">{peers.length ? peers.map((item) => <RelatedCard key={item.edge.id} {...item} onVisit={props.onVisit} />) : <div className="paperline-empty">暂时没有摘要证据足够的同任务候选。</div>}</div>

          <div className="paperline-section-title"><span>05</span><h2>论文信息与资源</h2><small>可继续在图谱信息栏补充和修改</small></div>
          <div className="lineage-resource-grid">
            <article><BookOpen /><div><strong>论文来源</strong><p>{node.doi ? `DOI ${node.doi}` : node.arxiv ? `arXiv ${node.arxiv}` : '学术索引记录'}</p><Link href={node.url}>打开论文 <ArrowUpRight size={13} /></Link></div></article>
            <article><Code2 /><div><strong>开源代码</strong><p>{node.code || '尚未收录，可在图谱信息栏补充。'}</p>{node.code && <Link href={node.code}>打开仓库 <ArrowUpRight size={13} /></Link>}</div></article>
            <article><Database /><div><strong>实验数据集</strong><p>{node.datasets || '摘要未提供或尚未分析。'}</p></div></article>
          </div>

          <div className="lineage-graph-cta">
            <Network size={28} />
            <div><strong>这份整理已经同步到个人关系网</strong><p>在图谱中可以拖动节点、修改连线、以任意论文为中心继续扩展。</p></div>
            <Button onClick={() => props.onGraph(node.id)}>打开关系图 <ArrowRight /></Button>
          </div>
        </section>
      )}
    </main>
  );
}
