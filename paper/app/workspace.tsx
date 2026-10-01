'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Network,
  Search,
  Plus,
  Sparkles,
  ArrowUpRight,
  BookOpen,
  Focus,
  Link2,
  LoaderCircle,
  Save,
  Check,
  Trash2,
  ArrowRight,
  ArrowLeft,
  FileText,
  RefreshCw,
  RotateCcw,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { seed } from '@/lib/seed';
import {
  kindNames,
  relationNames,
  cleanUrl,
  type Graph,
  type GraphEdge,
  type PaperNode,
} from '@/lib/model';
import GraphCanvas from './graph-canvas';
import ResearchBriefPanel from './research-brief';
import type { RelationScope } from '@/lib/graph-view';
import ExpansionResult, { type ExpansionReport } from './expansion-report';
import PaperlineView from './paperline-view';
async function request(path: string, body?: unknown, method = 'POST') {
  const res = await fetch(
    '/api/' + path,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data: any = await res.json().catch(() => ({
    error:
      res.status === 504
        ? '服务响应超时，请稍后重试。'
        : '服务暂时无法响应，请稍后重试。',
  }));
  if (!res.ok)
    throw Object.assign(new Error(data.error || '操作未完成，请重试。'), {
      status: res.status,
    });
  return data;
}
const statusLabel = {
  verified: '来源支持',
  candidate: '待核验',
  manual: '人工确认',
};
function External({
  href,
  children,
  className = '',
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const url = cleanUrl(href);
  return url ? (
    <a href={url} className={className} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : null;
}
function LinkedText({ value }: { value: string }) {
  return (
    <>
      {value.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        part.startsWith('http') ? (
          <External key={i} href={part} className="inline-link">
            {part}
          </External>
        ) : (
          part
        ),
      )}
    </>
  );
}
function Pick({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v || '')}
      items={options}
    >
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem value={o.value} key={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function Workspace() {
  const [mode, setMode] = useState<'lineage' | 'graph'>('graph');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [graph, setGraph] = useState<Graph>(seed),
    [selected, setSelected] = useState('arxiv:2505.23214'),
    [focus, setFocus] = useState<string | null>('arxiv:2505.23214');
  const [viewRevision, setViewRevision] = useState(0);
  const [viewScope, setViewScope] = useState<RelationScope>('insight');
  const [researchGoals, setResearchGoals] = useState<Record<string, string>>(
    {},
  );
  const [trail, setTrail] = useState<string[]>([]);
  const [reports, setReports] = useState<Record<string, ExpansionReport>>({});
  const [elapsed, setElapsed] = useState(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [login, setLogin] = useState(false),
    [ready, setReady] = useState(false),
    [ai, setAi] = useState(false),
    [aiProvider, setAiProvider] = useState(''),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState(''),
    [failure, setFailure] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState(''),
    [searching, setSearching] = useState(false),
    [results, setResults] = useState<PaperNode[]>([]),
    [searched, setSearched] = useState(false),
    [searchWarn, setSearchWarn] = useState('');
  const [filter, setFilter] = useState(''),
    [connecting, setConnecting] = useState(false),
    [edgeDraft, setEdgeDraft] = useState<GraphEdge | null>(null),
    [edgeOpen, setEdgeOpen] = useState(false),
    [editOpen, setEditOpen] = useState(false),
    [draft, setDraft] = useState<PaperNode | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]),
    [deletePending, setDeletePending] = useState(false);
  useEffect(() => {
    setElapsed(0);
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    const closePanels = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setLibraryOpen(false);
      setDetailsOpen(false);
    };
    window.addEventListener('keydown', closePanels);
    return () => window.removeEventListener('keydown', closePanels);
  }, []);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const searchSeq = useRef(0);
  const node = graph.nodes.find((n) => n.id === selected) || graph.nodes[0];
  const paperNodes = graph.nodes.filter(
    (n) =>
      n.kind === 'paper' &&
      `${n.label} ${n.title}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const connected = graph.edges.filter(
    (e) => e.source === node?.id || e.target === node?.id,
  );
  const notify = useCallback((s: string, error = false) => {
    setNotice(s);
    setFailure(error);
  }, []);
  async function reload() {
    try {
      const data = await request('graph');
      setGraph(data);
      const ids = new Set<string>(data.nodes.map((item: PaperNode) => item.id));
      if (!ids.has(selectedRef.current)) {
        const fallback = data.nodes[0]?.id || '';
        selectedRef.current = fallback;
        setSelected(fallback);
        setFocus(fallback || null);
      }
      setAi(data.aiConfigured);
      setAiProvider(data.aiProvider || 'AI');
      setReady(true);
      setLogin(false);
    } catch (e: any) {
      setLogin(e.status === 401);
      notify(e.message, true);
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  const commit = useCallback((g: Graph) => {
    setGraph(g);
    graphRef.current = g;
  }, []);
  async function doSearch(value = query) {
    if (value.trim().length < 2) {
      setSearchWarn('请输入至少两个字符。');
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchWarn('');
    setSearched(false);
    try {
      const d = await request('search?q=' + encodeURIComponent(value));
      if (seq !== searchSeq.current) return;
      setResults(d.papers);
      setSearchWarn(d.warnings.join(' '));
      setSearched(true);
    } catch (e: any) {
      if (seq === searchSeq.current) setSearchWarn(e.message);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }
  function searchFor(value: string) {
    setQuery(value);
    setSearchOpen(true);
    void doSearch(value);
  }
  async function addPaper(p: PaperNode) {
    setBusy('正在加入论文…');
    try {
      const d = await request('papers', { id: p.id });
      commit(d.graph);
      const id = d.ids[d.addedId] || d.addedId;
      visit(id);
      setSearchOpen(false);
      notify('论文已加入图谱，可继续 AI 分析或展开引用。');
      return id;
    } catch (e: any) {
      notify(e.message, true);
      throw e;
    } finally {
      setBusy('');
    }
  }
  async function organizePaper(p: PaperNode) {
    try {
      const id = await addPaper(p);
      setMode('lineage');
      await exploreCenter(id);
    } catch {
      // addPaper/exploreCenter already surface the actionable error.
    }
  }
  async function analyze(id = selected) {
    if (busy) return;
    setBusy('AI 正在阅读摘要并提取关系，通常需要 20–60 秒…');
    try {
      const d = await request('analyze', { id });
      commit(d.graph);
      if (selectedRef.current === id) {
        setSuggestions(d.suggestions);
        setFocus(id);
      }
      setReports((old) => ({
        ...old,
        [id]: { mode: 'analyze', warnings: [] },
      }));
      notify('分析已保存。AI 新关系标记为待核验，点击连线可查看原文依据。');
    } catch (e: any) {
      setReports((old) => ({
        ...old,
        [id]: { mode: 'analyze', warnings: [], error: e.message },
      }));
      notify(e.message, true);
    } finally {
      setBusy('');
    }
  }
  async function expand(id = selected) {
    if (busy) return;
    setBusy('正在从多个来源查询引用与相关论文…');
    try {
      const d = await request('expand', { id });
      commit(d.graph);
      if (selectedRef.current === id) {
        setFocus(id);
        setViewScope('all');
      }
      setReports((old) => ({
        ...old,
        [id]: {
          mode: 'expand',
          addedNodes: d.addedNodes,
          addedEdges: d.addedEdges,
          sections: d.sections,
          totalReferences: d.totalReferences,
          warnings: d.warnings,
        },
      }));
      const counts = `参考文献 ${d.loadedReferences}${d.totalReferences == null ? '' : `/${d.totalReferences}`} 篇，被引用 ${d.loadedCitations} 篇，相关候选 ${d.loadedRelated} 篇`;
      notify(
        `${d.addedEdges ? `已新增 ${d.addedEdges} 条关系` : '没有新增关系'}。${counts}。${d.warnings.join('；')}`,
        d.warnings.length > 0,
      );
    } catch (e: any) {
      setReports((old) => ({
        ...old,
        [id]: { mode: 'expand', warnings: [], error: e.message },
      }));
      notify(e.message, true);
    } finally {
      setBusy('');
    }
  }
  async function exploreCenter(id = selected) {
    if (busy) return;
    setFocus(id);
    setViewScope('insight');
    setConnecting(false);
    const label = graph.nodes.find((n) => n.id === id)?.label || '当前节点';
    setBusy(
      `正在以 ${label} 为中心：解读中心摘要、检索文献、对照摘要并生成阅读路线（约 1–3 分钟）…`,
    );
    try {
      const d = await request('explore', {
        id,
        goal:
          researchGoals[id] ??
          graph.nodes.find((n) => n.id === id)?.research?.goal ??
          '',
      });
      commit(d.graph);
      if (selectedRef.current === id) {
        setFocus(d.centerId);
        setSuggestions(d.queries || []);
      }
      setReports((old) => ({
        ...old,
        [id]: {
          mode: 'explore',
          addedNodes: d.addedNodes,
          addedEdges: d.addedEdges,
          sections: d.sections,
          warnings: d.warnings,
        },
      }));
      notify(
        `已围绕 ${label} 绘制图谱：新增 ${d.addedNodes} 个节点、${d.addedEdges} 条关系，推荐 ${d.relatedPapers} 篇值得读的论文，研究解读已保存。${d.warnings.join('；')}`,
        d.warnings.length > 0,
      );
      return {
        centerId: d.centerId,
        addedNodes: d.addedNodes,
        addedEdges: d.addedEdges,
      };
    } catch (e: any) {
      setReports((old) => ({
        ...old,
        [id]: { mode: 'explore', warnings: [], error: e.message },
      }));
      notify(e.message, true);
    } finally {
      setBusy('');
    }
  }
  async function sourceStatus() {
    if (busy) return;
    setBusy('正在检查论文数据源…');
    try {
      const sample =
        selected === 'arxiv:2505.23214'
          ? 'samamba'
          : selected === 'arxiv:2312.00752'
            ? 'mamba'
            : 'sam2';
      const d = await request('source-status?sample=' + sample);
      const labels: Record<string, string> = {
        references: '参考文献',
        citations: '被引用',
        related: '相关论文',
      };
      notify(
        `${d.paper} 数据源检查：` +
          Object.entries(d.sections)
            .map(
              ([k, v]: [string, any]) =>
                `${labels[k]} ${v.state === 'failed' || v.state === 'unavailable' ? '暂不可用' : v.count + ' 篇'}`,
            )
            .join('；'),
        d.warnings.length > 0,
      );
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy('');
    }
  }
  function visit(id: string) {
    const previous = selectedRef.current;
    if (previous !== id) setTrail((old) => [...old, previous].slice(-40));
    selectedRef.current = id;
    setViewScope('insight');
    setSelected(id);
    setFocus(id);
    setSuggestions([]);
    setConnecting(false);
    setDetailsOpen(true);
  }
  function back() {
    const previous = trail.at(-1);
    if (!previous) return;
    setTrail((old) => old.slice(0, -1));
    selectedRef.current = previous;
    setViewScope('insight');
    setSelected(previous);
    setFocus(previous);
    setSuggestions([]);
    setConnecting(false);
  }
  function choose(id: string) {
    if (connecting && id !== selected) {
      setEdgeDraft({
        id: '',
        source: selected,
        target: id,
        type: '使用方法',
        description: '',
        evidence: '',
        sourceUrl: '',
        origin: 'manual',
        status: 'manual',
      });
      setEdgeOpen(true);
      setConnecting(false);
      setDeletePending(false);
    } else {
      visit(id);
    }
  }
  async function move(id: string, x: number, y: number) {
    try {
      const d = await request('nodes', { id, x, y }, 'PATCH');
      commit(d.graph);
    } catch (e: any) {
      notify('节点位置未保存：' + e.message, true);
    }
  }
  async function saveNode() {
    if (!draft) return;
    setBusy('正在保存笔记…');
    try {
      const current = graph.nodes.find((n) => n.id === draft.id)!;
      const changes: Record<string, unknown> = { id: draft.id };
      for (const field of [
        'label',
        'abstract',
        'notes',
        'experiments',
        'datasets',
        'code',
      ] as const) {
        if ((draft[field] || '') !== (current[field] || ''))
          changes[field] = draft[field] || '';
      }
      const d = await request('nodes', changes, 'PATCH');
      commit(d.graph);
      setEditOpen(false);
      notify('信息和笔记已保存，后续 AI 更新不会覆盖这些字段。');
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy('');
    }
  }
  async function saveEdge() {
    if (!edgeDraft) return;
    setBusy('正在保存关系…');
    try {
      const d = await request('edges', edgeDraft);
      commit(d.graph);
      setEdgeOpen(false);
      notify('关系已保存为人工确认。');
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy('');
    }
  }
  async function deleteEdge() {
    if (!edgeDraft) return;
    if (!deletePending) {
      setDeletePending(true);
      return;
    }
    setBusy('正在删除关系…');
    try {
      const d = await request('edges', { id: edgeDraft.id }, 'DELETE');
      commit(d.graph);
      setEdgeOpen(false);
      notify('关系已删除，自动展开不会恢复这条关系。');
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy('');
    }
  }
  function exportGraph() {
    const blob = new Blob([JSON.stringify(graph, null, 2)], {
        type: 'application/json',
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'paper-atlas.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const life = new AbortController();
    const tools: Array<{
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: any) => unknown;
    }> = [
      {
        name: 'read_research_graph',
        title: '读取个人论文图谱',
        description: '读取当前已保存的论文节点与关系。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => ({
          nodes: graphRef.current.nodes,
          edges: graphRef.current.edges,
        }),
      },
      {
        name: 'search_research_papers',
        title: '检索论文',
        description: '检索学术索引并在界面打开候选结果，不添加到个人图谱。',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 2, maxLength: 300 },
          },
          required: ['query'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input: any) => {
          if (
            typeof input?.query !== 'string' ||
            input.query.trim().length < 2 ||
            input.query.length > 300
          )
            throw Error('需要 2–300 字符的检索词');
          const d = await request(
            'search?q=' + encodeURIComponent(input.query),
          );
          setQuery(input.query);
          setSearchOpen(true);
          setResults(d.papers);
          setSearched(true);
          return {
            papers: d.papers.map((p: PaperNode) => ({
              id: p.id,
              title: p.title,
              year: p.year,
            })),
            warnings: d.warnings,
          };
        },
      },
      {
        name: 'add_research_paper',
        title: '添加论文到图谱',
        description: '按检索结果中的论文 ID 抓取元数据，保存到个人图谱并选中。',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input: any) => {
          if (typeof input?.id !== 'string' || input.id.length > 500)
            throw Error('论文 ID 不正确');
          const d = await request('papers', { id: input.id });
          commit(d.graph);
          const id = d.ids[d.addedId] || d.addedId;
          setSelected(id);
          return { id, nodeCount: d.graph.nodes.length };
        },
      },
    ];
    tools.push({
      name: 'expand_research_center',
      title: '以节点为中心扩展图谱',
      description:
        '检索真实论文，使用 AI 筛选关系，保存新增内容并将所选节点置于画布中心。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          goal: { type: 'string', maxLength: 500 },
        },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: any) => {
        if (
          typeof input?.id !== 'string' ||
          !graphRef.current.nodes.some((n) => n.id === input.id)
        )
          throw Error('中心节点不存在');
        if (
          input.goal != null &&
          (typeof input.goal !== 'string' || input.goal.length > 500)
        )
          throw Error('研究目标最多 500 字符');
        const d = await request('explore', {
          id: input.id,
          goal: input.goal || '',
        });
        commit(d.graph);
        setSelected(d.centerId);
        setFocus(d.centerId);
        setSuggestions(d.queries || []);
        return { id: d.centerId, nodeCount: d.graph.nodes.length };
      },
    });
    for (const t of tools)
      try {
        void Promise.resolve(
          ctx.registerTool(t, { signal: life.signal }),
        ).catch(() => {});
      } catch {}
    return () => life.abort();
  }, [commit]);
  return (
    <div className="atlas">
      <header className={'topbar ' + (mode === 'graph' ? 'graph-topbar' : '')}>
        <div className="brand">
          <span className="brand-mark">
            <Network size={23} />
          </span>
          <b>Paperline Atlas</b>
          <span className="version">智能论文脉络与关系图谱</span>
        </div>
        <div className="workspace-switch" aria-label="工作区视图">
          <button className={mode === 'lineage' ? 'active' : ''} onClick={() => setMode('lineage')}>
            <Sparkles size={15} /> 智能整理
          </button>
          <button className={mode === 'graph' ? 'active' : ''} onClick={() => setMode('graph')}>
            <Network size={15} /> 关系图谱
          </button>
        </div>
        <Button
          variant="ghost"
          onClick={exportGraph}
          aria-label="导出个人图谱"
          title="导出图谱"
        >
          <Download size={17} />
        </Button>
        <Button
          variant="outline"
          onClick={() => setSearchOpen(true)}
          disabled={!ready}
        >
          <Plus />
          添加论文
        </Button>
      </header>
      {(busy || notice || login) && (
        <div
          className={'statusbar ' + (failure && !busy ? 'error' : '')}
          role="status"
        >
          {busy ? (
            <>
              <LoaderCircle className="spin" size={15} />
              <span>
                {busy}
                {elapsed > 0 ? `（已等待 ${elapsed} 秒）` : ''}
              </span>
            </>
          ) : login ? (
            <>
              <span>登录后即可保存和扩展个人图谱。</span>
              <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
                登录工作台 <ArrowRight size={14} />
              </a>
            </>
          ) : (
            <>
              <span>{notice}</span>
              <button onClick={() => setNotice('')} aria-label="关闭提示">
                ×
              </button>
            </>
          )}
        </div>
      )}
      {mode === 'lineage' ? (
        <PaperlineView
          graph={graph}
          node={node}
          query={query}
          results={results}
          searched={searched}
          searching={searching}
          warning={searchWarn}
          busy={!!busy}
          ready={ready}
          ai={ai}
          aiProvider={aiProvider}
          onQuery={setQuery}
          onSearch={() => void doSearch()}
          onOrganize={(paper) => void organizePaper(paper)}
          onAdd={(paper) => void addPaper(paper).catch(() => {})}
          onVisit={(id) => visit(id)}
          onExplore={(id) => void exploreCenter(id)}
          onGraph={(id) => {
            if (id) visit(id);
            setMode('graph');
          }}
        />
      ) : (
      <div
        className={
          'workspace graph-workspace ' +
          (libraryOpen ? 'library-open ' : '') +
          (detailsOpen ? 'details-open ' : '') +
          (busy || notice || login ? 'with-status' : '')
        }
      >
        <aside
          id="paper-library-panel"
          className="library"
          aria-label="论文库"
          aria-hidden={!libraryOpen}
          inert={libraryOpen ? undefined : true}
        >
          <button className="panel-close" onClick={() => setLibraryOpen(false)} aria-label="关闭论文库">×</button>
          <div className="eyebrow">MY LIBRARY</div>
          <h2>我的研究</h2>
          <div className="search-box">
            <Search size={17} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="查找已收藏论文"
              aria-label="筛选收藏论文"
            />
          </div>
          <button
            className={'collection ' + (!focus ? 'active' : '')}
            onClick={() => setFocus(null)}
          >
            <Network size={17} />
            全部关系<span>{graph.nodes.length}</span>
          </button>
          <div className="section-label">
            论文收藏{' '}
            <span>
              {graph.nodes
                .filter((n) => n.kind === 'paper')
                .length.toString()
                .padStart(2, '0')}
            </span>
          </div>
          <div className="paper-list">
            {paperNodes.map((n) => (
              <button
                className={
                  'paper-item ' + (n.id === selected ? 'selected' : '')
                }
                key={n.id}
                onClick={() => choose(n.id)}
              >
                <BookOpen size={17} />
                <div>
                  <strong>{n.label}</strong>
                  <small>
                    {n.year || '年份未知'} ·{' '}
                    {n.analyzed ? '已分析' : '研究论文'}
                  </small>
                </div>
              </button>
            ))}
            {!paperNodes.length && <p className="muted">没有匹配的收藏。</p>}
          </div>
          <div className="library-bottom">
            <Sparkles size={18} />
            <div>
              <strong>{ai ? `${aiProvider} 已连接` : '个人研究空间'}</strong>
              <p>有依据的关系，持续生长的图谱。</p>
            </div>
          </div>
        </aside>
        <main className="graph-panel">
          <div className="graph-heading">
            <div>
              <div className="eyebrow">RESEARCH CONSTELLATION</div>
              <h1>
                {!ready
                  ? '正在载入你的论文星图'
                  : focus
                  ? (graph.nodes.find((n) => n.id === focus)?.label || '论文') +
                    ' 的关系网'
                  : '全部研究关系'}
                <span>
                  {!ready ? (
                    '正在读取已保存的论文、关系和笔记…'
                  ) : (
                    <>
                      {focus
                        ? graph.edges.filter(
                            (e) => e.source === focus || e.target === focus,
                          ).length + ' 条直接关系 · 收藏共 '
                        : '收藏共 '}
                      {graph.nodes.length} 个节点 · {graph.edges.length} 条关系 ·{' '}
                      {
                        graph.edges.filter((e) => e.status === 'candidate')
                          .length
                      }{' '}
                      条待核验
                    </>
                  )}
                </span>
              </h1>
            </div>
            <div className="heading-actions">
              <Button
                variant="outline"
                onClick={() => setLibraryOpen((open) => !open)}
                title={libraryOpen ? '关闭论文库' : '打开论文库'}
                aria-expanded={libraryOpen}
                aria-controls="paper-library-panel"
              >
                <BookOpen />
                论文库
              </Button>
              <Button
                variant="outline"
                onClick={() => setDetailsOpen((open) => !open)}
                title={detailsOpen ? '关闭节点信息' : '打开节点信息'}
                aria-expanded={detailsOpen}
                aria-controls="node-details-panel"
              >
                <FileText />
                节点信息
              </Button>
              <Button
                variant="outline"
                onClick={back}
                disabled={!trail.length}
                title="返回上一个节点"
              >
                <ArrowLeft />
                返回
              </Button>
              <Button
                variant="outline"
                title="恢复所选节点的默认布局、缩放和分类显示，保留全部数据"
                onClick={() => {
                  setFocus(selected);
                  setViewScope('insight');
                  setConnecting(false);
                  setFilter('');
                  setViewRevision((v) => v + 1);
                  notify('视图已重置，论文、笔记和关系均已保留。');
                }}
              >
                <RotateCcw />
                重置视图
              </Button>
              <Button
                variant="outline"
                onClick={() => setFocus(selected)}
                title="只显示所选节点及其直接关系"
              >
                <Focus />
                只看此节点
              </Button>
              <Button
                variant={connecting ? 'secondary' : 'outline'}
                disabled={!ready}
                onClick={() => setConnecting((c) => !c)}
                title="手动连线"
              >
                <Link2 />
                <span>连线</span>
              </Button>
            </div>
          </div>
          {ready ? (
            <GraphCanvas
              key={viewRevision}
              graph={graph}
              preferredScope={viewScope}
              selected={selected}
              focus={focus}
              connecting={connecting}
              onSelect={choose}
              onEdge={(e) => {
                setEdgeDraft({ ...e });
                setEdgeOpen(true);
                setDeletePending(false);
              }}
              onMove={move}
              onConnect={() => ready && setConnecting((c) => !c)}
              onReset={() => setFocus(null)}
            />
          ) : (
            <div className="personal-graph-loading" role="status">
              <LoaderCircle className="spin" />
              <strong>正在载入你的论文星图</strong>
              <span>正在读取已保存的论文、关系和笔记…</span>
            </div>
          )}
        </main>
        <aside
          id="node-details-panel"
          className="details"
          aria-label="节点信息"
          aria-hidden={!detailsOpen}
          inert={detailsOpen ? undefined : true}
        >
          <button className="panel-close" onClick={() => setDetailsOpen(false)} aria-label="关闭节点信息">×</button>
          {node && (
            <>
              <div className="detail-top">
                <span className="pill">{kindNames[node.kind]}</span>
                <span>{node.year || '研究实体'}</span>
              </div>
              <h2>{node.label}</h2>
              <p className="paper-title">{node.title}</p>
              <External className="source-link" href={node.url}>
                查看原始来源
                <ArrowUpRight size={16} />
              </External>
              <label className="research-goal-input">
                这次想研究什么？
                <textarea
                  maxLength={500}
                  rows={2}
                  placeholder="例如：找可替换模块、理解技术来源、找同任务的不同路线"
                  value={researchGoals[node.id] ?? node.research?.goal ?? ''}
                  onChange={(e) =>
                    setResearchGoals((old) => ({
                      ...old,
                      [node.id]: e.target.value,
                    }))
                  }
                />
              </label>
              <Button
                className="expand-btn center-expand"
                onClick={() => exploreCenter(node.id)}
                disabled={!ready || !!busy || !ai}
              >
                <Sparkles />
                以此节点为中心 · AI 扩展
              </Button>
              <p className="center-hint">
                {ai
                  ? '自动查找基础方法、平行工作和后续论文，并绘制到当前星图。'
                  : 'AI 暂未连接，仍可展开引用或手动建立关系。'}
              </p>
              {node.kind === 'paper' ? (
                <div className="detail-actions">
                  <Button
                    className="expand-btn"
                    onClick={() => analyze()}
                    disabled={!ready || !!busy || !ai}
                  >
                    <Sparkles />
                    {node.analyzed ? '重新分析摘要' : 'AI 分析摘要'}
                  </Button>
                  <Button
                    variant="outline"
                    className="expand-btn"
                    onClick={() => expand()}
                    disabled={!ready || !!busy}
                  >
                    <Network />
                    展开引用与相关论文
                  </Button>
                </div>
              ) : (
                <Button
                  className="expand-btn"
                  disabled={!ready}
                  onClick={() => searchFor(node.title)}
                >
                  <Search />
                  查找对应论文
                </Button>
              )}
              <button
                className="source-check"
                onClick={() => sourceStatus()}
                disabled={!!busy}
              >
                <RefreshCw size={13} />
                检查示例数据源
              </button>
              {reports[node.id] && (
                <ExpansionResult
                  report={reports[node.id]}
                  busy={!!busy}
                  onRetry={() => {
                    const mode = reports[node.id].mode;
                    void (mode === 'explore'
                      ? exploreCenter(node.id)
                      : mode === 'expand'
                        ? expand(node.id)
                        : analyze(node.id));
                  }}
                />
              )}
              <div className="divider" />
              <Tabs defaultValue="overview" key={node.id}>
                <TabsList variant="line" className="detail-tabs">
                  <TabsTrigger value="overview">概览</TabsTrigger>
                  <TabsTrigger value="relations">
                    关系 {connected.length}
                  </TabsTrigger>
                  <TabsTrigger value="notes">笔记</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <ResearchBriefPanel
                    node={node}
                    graph={graph}
                    onVisit={visit}
                  />
                  {!node.research && (
                    <div className="research-empty">
                      <strong>让图谱回答研究问题</strong>
                      <p>
                        点击“以此节点为中心 · AI 扩展”，获取这篇论文的技术路线、值得对照的论文及具体阅读问题。
                      </p>
                    </div>
                  )}
                  <p className="summary">
                    {node.summary ||
                      '点击 AI 分析摘要，提取方法、领域和数据集关系。'}
                  </p>
                  {node.abstract && (
                    <details className="abstract-block">
                      <summary>原始摘要</summary>
                      <p>{node.abstract}</p>
                    </details>
                  )}
                  <div className="divider" />
                  <div className="section-label">关联与资源</div>
                  <External className="resource-card" href={node.code}>
                    <Link2 size={18} />
                    <div>
                      <strong>开源代码 / 项目主页</strong>
                      <small>
                        {node.code?.replace('https://', '').slice(0, 40)}
                      </small>
                    </div>
                    <ArrowUpRight size={16} />
                  </External>
                  {!node.code && (
                    <p className="resource-missing">
                      尚未收录代码链接，可在下方补充。
                    </p>
                  )}
                  <div className="info-card">
                    <span>实验数据集与链接</span>
                    <p>
                      <LinkedText
                        value={
                          node.datasets ||
                          '摘要未提供或尚未分析，可手动补充链接。'
                        }
                      />
                    </p>
                  </div>
                  <div className="info-card">
                    <span>实验结构与设置</span>
                    <p>
                      <LinkedText
                        value={
                          node.experiments ||
                          '待补充实验设置、baseline 和消融实验。'
                        }
                      />
                    </p>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="suggestions">
                      <span className="section-label">
                        继续探索 · AI 检索建议
                      </span>
                      {suggestions.map((s) => (
                        <button key={s} onClick={() => searchFor(s)}>
                          {s}
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={!ready}
                    onClick={() => {
                      setDraft({ ...node });
                      setEditOpen(true);
                    }}
                  >
                    <FileText />
                    补充信息与实验记录
                  </Button>
                  <p className="evidence-note">
                    实线：来源支持或人工确认。虚线：待核验候选。引用关系不等于直接
                    baseline。
                  </p>
                </TabsContent>
                <TabsContent value="relations">
                  <div className="relation-list">
                    {connected.map((e) => {
                      const other = graph.nodes.find(
                        (n) =>
                          n.id === (e.source === node.id ? e.target : e.source),
                      );
                      return (
                        <article key={e.id} className="relation-card">
                          <button
                            className="relation-evidence"
                            onClick={() => {
                              setEdgeDraft({ ...e });
                              setEdgeOpen(true);
                              setDeletePending(false);
                            }}
                          >
                            <div>
                              <strong>
                                {e.source === node.id ? '→' : '←'}{' '}
                                {other?.label}
                              </strong>
                              <span className={'relation-status ' + e.status}>
                                {statusLabel[e.status]}
                              </span>
                            </div>
                            <small>{e.type}</small>
                            <p>{e.description || e.evidence}</p>
                            <small className="edit-relation-hint">
                              查看依据 / 编辑关系
                            </small>
                          </button>
                          {other && (
                            <button
                              className="visit-related"
                              onClick={() => visit(other.id)}
                            >
                              探索 {other.label}
                              <ArrowRight size={14} />
                            </button>
                          )}
                        </article>
                      );
                    })}
                    {!connected.length && (
                      <p className="muted">
                        暂无关系。可展开引用，或手动连线。
                      </p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="notes">
                  <p className="summary">
                    {node.notes ||
                      '记下这篇论文与你的研究之间的联系。笔记只属于你。'}
                  </p>
                  <Button
                    variant="outline"
                    disabled={!ready}
                    onClick={() => {
                      setDraft({ ...node });
                      setEditOpen(true);
                    }}
                  >
                    <FileText />
                    编辑个人笔记
                  </Button>
                </TabsContent>
              </Tabs>
            </>
          )}
        </aside>
      </div>
      )}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="search-dialog">
          <DialogHeader>
            <DialogTitle>从一篇论文开始</DialogTitle>
            <DialogDescription>
              输入完整题名、关键词、arXiv ID 或 DOI。确认论文后加入你的图谱。
            </DialogDescription>
          </DialogHeader>
          <form
            className="modal-search"
            onSubmit={(e) => {
              e.preventDefault();
              void doSearch();
            }}
          >
            <Search size={19} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例如 SAMamba、2408.00714"
              aria-label="论文检索词"
              autoFocus
            />
            <Button type="submit" disabled={searching || !ready}>
              {searching ? <LoaderCircle className="spin" /> : '搜索'}
            </Button>
          </form>
          {searchWarn && <p className="inline-warning">{searchWarn}</p>}
          <div className="search-results">
            {searching ? (
              <div className="loading-state">
                <LoaderCircle className="spin" />
                正在查询多个学术来源…
              </div>
            ) : (
              results.map((p) => (
                <article key={p.id}>
                  <div className="result-meta">
                    {p.year || '年份未知'} ·{' '}
                    {p.arxiv ? 'arXiv' : p.doi ? 'DOI 文献' : '学术索引'}
                    {graph.nodes.some((n) => n.id === p.id) && (
                      <span>已在图谱中</span>
                    )}
                  </div>
                  <h3>{p.title}</h3>
                  <p>
                    {p.abstract?.slice(0, 260) ||
                      '索引暂未提供摘要；加入后可手动补充。'}
                    {(p.abstract?.length || 0) > 260 ? '…' : ''}
                  </p>
                  <div className="result-actions">
                    <External href={p.url}>
                      原始来源 <ArrowUpRight size={14} />
                    </External>
                    <Button
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => {
                        void addPaper(p).catch(() => {});
                      }}
                    >
                      <Plus />
                      加入图谱
                    </Button>
                  </div>
                </article>
              ))
            )}
            {!searching && searched && !results.length && (
              <div className="empty-state">
                未找到匹配论文，试试完整英文题名或 DOI。
              </div>
            )}
            {!searched && !searching && !results.length && (
              <div className="search-examples">
                <span>试试这些起点</span>
                {[
                  'SAMamba',
                  'Segment Anything',
                  'Mamba infrared small target',
                ].map((q) => (
                  <button key={q} onClick={() => searchFor(q)}>
                    {q}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="edit-dialog">
          <DialogHeader>
            <DialogTitle>编辑研究记录</DialogTitle>
            <DialogDescription>
              人工填写的内容会保留，AI 更新不会覆盖。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveNode();
              }}
              className="edit-form"
            >
              <label>
                显示名称
                <input
                  required
                  value={draft.label}
                  onChange={(e) =>
                    setDraft({ ...draft, label: e.target.value })
                  }
                />
              </label>
              <label>
                论文摘要
                <textarea
                  rows={4}
                  value={draft.abstract || ''}
                  onChange={(e) =>
                    setDraft({ ...draft, abstract: e.target.value })
                  }
                  placeholder="来源没有摘要时，可粘贴原文摘要。"
                />
              </label>
              <label>
                开源代码 / 项目链接
                <input
                  value={draft.code || ''}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="https://github.com/…"
                />
              </label>
              <label>
                数据集与链接
                <textarea
                  rows={3}
                  value={draft.datasets || ''}
                  onChange={(e) =>
                    setDraft({ ...draft, datasets: e.target.value })
                  }
                  placeholder="数据集名称、下载地址与备注"
                />
              </label>
              <label>
                实验结构与设置
                <textarea
                  rows={4}
                  value={draft.experiments || ''}
                  onChange={(e) =>
                    setDraft({ ...draft, experiments: e.target.value })
                  }
                  placeholder="模型结构、训练设置、baseline、消融实验与来源"
                />
              </label>
              <label>
                个人笔记
                <textarea
                  rows={4}
                  value={draft.notes || ''}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                />
              </label>
              <Button type="submit" disabled={!!busy}>
                <Save />
                保存记录
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={edgeOpen} onOpenChange={setEdgeOpen}>
        <DialogContent className="edit-dialog">
          <DialogHeader>
            <DialogTitle>
              {edgeDraft?.id ? '关系详情与编辑' : '建立新关系'}
            </DialogTitle>
            <DialogDescription>
              保留原文依据，或按你的研究理解修改关系。保存后标为人工确认。
            </DialogDescription>
          </DialogHeader>
          {edgeDraft && (
            <form
              className="edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdge();
              }}
            >
              <div className="edge-path">
                {graph.nodes.find((n) => n.id === edgeDraft.source)?.label}
                <ArrowRight size={17} />
                {graph.nodes.find((n) => n.id === edgeDraft.target)?.label}
              </div>
              <span className={'relation-status ' + edgeDraft.status}>
                {statusLabel[edgeDraft.status]} ·{' '}
                {edgeDraft.origin === 'ai'
                  ? 'AI 提取'
                  : edgeDraft.origin === 'index'
                    ? '学术索引'
                    : edgeDraft.origin === 'seed'
                      ? '已核验示例'
                      : '个人编辑'}
              </span>
              <label>
                关系类型
                <Pick
                  value={edgeDraft.type}
                  onChange={(v) => setEdgeDraft({ ...edgeDraft, type: v })}
                  options={[...new Set([...relationNames, edgeDraft.type])].map(
                    (s) => ({ value: s, label: s }),
                  )}
                  label="关系类型"
                />
              </label>
              <label>
                关系说明
                <textarea
                  rows={3}
                  value={edgeDraft.description}
                  onChange={(e) =>
                    setEdgeDraft({ ...edgeDraft, description: e.target.value })
                  }
                />
              </label>
              <label>
                原文证据 / 个人依据
                <textarea
                  rows={4}
                  value={edgeDraft.evidence}
                  onChange={(e) =>
                    setEdgeDraft({ ...edgeDraft, evidence: e.target.value })
                  }
                />
              </label>
              <label>
                来源链接
                <input
                  value={edgeDraft.sourceUrl}
                  onChange={(e) =>
                    setEdgeDraft({ ...edgeDraft, sourceUrl: e.target.value })
                  }
                />
              </label>
              <External href={edgeDraft.sourceUrl} className="source-link">
                核对原始来源
                <ArrowUpRight size={15} />
              </External>
              <div className="form-actions">
                <Button type="submit" disabled={!!busy || !ready}>
                  <Check />
                  确认并保存
                </Button>
                {edgeDraft.id && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => deleteEdge()}
                    disabled={!!busy || !ready}
                  >
                    <Trash2 />
                    {deletePending ? '再次点击确认删除' : '删除关系'}
                  </Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
