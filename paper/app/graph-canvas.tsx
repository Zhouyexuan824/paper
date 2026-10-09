'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
} from 'react';
import {
  BookOpen,
  Box,
  CircleHelp,
  Database,
  Focus,
  GitBranch,
  Link2,
  LoaderCircle,
  Maximize2,
  Network,
  Orbit,
  Quote,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { graphView, scopeLabels, type RelationScope } from '@/lib/graph-view';
import {
  kindNames,
  type Graph,
  type GraphEdge,
  type NodeKind,
  type PaperNode,
} from '@/lib/model';

type StarNode = PaperNode & {
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};
type StarLink = GraphEdge & {
  source: string | StarNode;
  target: string | StarNode;
};
type RelationFamily =
  | 'citation'
  | 'method'
  | 'field'
  | 'dataset'
  | 'comparison'
  | 'related'
  | 'custom';

const colors: Record<NodeKind, string> = {
  paper: '#70a7ff',
  method: '#b88cff',
  field: '#46d8bd',
  dataset: '#f5bd63',
};
const symbols: Record<NodeKind, string> = {
  paper: '●',
  method: '◆',
  field: '⬢',
  dataset: '■',
};
const scopeIcons: Record<RelationScope, ComponentType<{ size?: number }>> = {
  insight: Sparkles,
  all: Network,
  references: BookOpen,
  citations: Quote,
  methods: Box,
  datasets: Database,
  related: GitBranch,
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] || char,
  );
const stableDepth = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1)
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return ((Math.abs(hash) % 13) - 6) * 2.1;
};
const relationMeta: Record<
  RelationFamily,
  { label: string; symbol: string; color: string; background: string }
> = {
  citation: {
    label: '引用',
    symbol: '↗',
    color: '#87b5f4',
    background: 'rgba(25, 64, 116, .86)',
  },
  method: {
    label: '方法',
    symbol: '◆',
    color: '#c6a4f6',
    background: 'rgba(67, 43, 108, .88)',
  },
  field: {
    label: '领域',
    symbol: '⬢',
    color: '#6bd6c5',
    background: 'rgba(20, 84, 77, .88)',
  },
  dataset: {
    label: '数据集',
    symbol: '■',
    color: '#f0c77b',
    background: 'rgba(102, 73, 27, .88)',
  },
  comparison: {
    label: '对比',
    symbol: '⇄',
    color: '#e69aa3',
    background: 'rgba(102, 48, 62, .88)',
  },
  related: {
    label: '相关',
    symbol: '≈',
    color: '#85c9d9',
    background: 'rgba(24, 72, 88, .88)',
  },
  custom: {
    label: '自定义',
    symbol: '✎',
    color: '#afbdd2',
    background: 'rgba(51, 62, 82, .88)',
  },
};
const nodeId = (value: string | StarNode) =>
  typeof value === 'string' ? value : value.id;
const relationFamily = (link: StarLink): RelationFamily => {
  if (link.type === '引用') return 'citation';
  if (link.type === '研究领域') return 'field';
  if (link.type === '实验数据集') return 'dataset';
  if (['对比方法', '直接 baseline', '同任务方法'].includes(link.type))
    return 'comparison';
  if (
    ['使用方法', '提出模块', '方法借鉴', '技术关联', '可借鉴方法'].includes(
      link.type,
    )
  )
    return 'method';
  if (link.type === '自定义') return 'custom';
  return 'related';
};
const relationBadge = (link: StarLink, focus: string | null) => {
  const family = relationFamily(link);
  const statusMark =
    link.status === 'candidate' ? '?' : link.status === 'manual' ? '✎' : '✓';
  let label = link.type;
  if (link.type === '引用' && focus) {
    if (nodeId(link.source) === focus) label = '参考';
    if (nodeId(link.target) === focus) label = '被引用';
  } else {
    label =
      {
        研究领域: '领域',
        实验数据集: '数据集',
        '直接 baseline': 'Baseline',
        后续工作候选: '后续候选',
      }[link.type] || link.type;
  }
  const symbol = relationMeta[family].symbol;
  return `${statusMark === symbol ? symbol : `${statusMark} ${symbol}`} ${label}`;
};

type TreeEntry = { node: StarNode; relations: string[] };

function RelationshipTree({
  nodes,
  links,
  centerId,
  width: viewportWidth,
  onSelect,
  onEdge,
  onNavigate,
}: {
  nodes: StarNode[];
  links: StarLink[];
  centerId: string;
  width: number;
  onSelect: (id: string) => void;
  onEdge: (edge: GraphEdge) => void;
  onNavigate: (scope: RelationScope) => void;
}) {
  const center = nodes.find((node) => node.id === centerId)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    methods,
    related,
    references,
    followups,
    followupCount,
    linksByNode,
  } = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const groups = {
      methods: new Map<string, TreeEntry>(),
      related: new Map<string, TreeEntry>(),
      references: new Map<string, TreeEntry>(),
      followups: new Map<string, TreeEntry>(),
    };
    const edgesByNode = new Map<string, GraphEdge[]>();
    const methodRelations = new Set([
      '使用方法',
      '提出模块',
      '研究领域',
      '方法借鉴',
      '技术关联',
      '可借鉴方法',
    ]);
    const add = (
      group: Map<string, TreeEntry>,
      node: StarNode,
      edge: StarLink,
    ) => {
      const entry = group.get(node.id) || { node, relations: [] };
      if (!entry.relations.includes(edge.type)) entry.relations.push(edge.type);
      group.set(node.id, entry);
    };
    for (const edge of links) {
      if (edge.source !== centerId && edge.target !== centerId) continue;
      const neighborId = edge.source === centerId ? edge.target : edge.source;
      const neighbor = byId.get(neighborId);
      if (!neighbor || neighbor.kind === 'dataset') continue;
      const edgeRecord: GraphEdge = {
        ...edge,
        source: nodeId(edge.source),
        target: nodeId(edge.target),
      };
      edgesByNode.set(neighborId, [
        ...(edgesByNode.get(neighborId) || []),
        edgeRecord,
      ]);
      if (edge.type === '引用') {
        if (edge.source === centerId) add(groups.references, neighbor, edge);
        else add(groups.followups, neighbor, edge);
        continue;
      }
      if (edge.type === '后续工作候选') {
        add(groups.followups, neighbor, edge);
        continue;
      }
      if (
        neighbor.kind === 'method' ||
        neighbor.kind === 'field' ||
        methodRelations.has(edge.type)
      ) {
        add(groups.methods, neighbor, edge);
        continue;
      }
      if (neighbor.kind === 'paper') add(groups.related, neighbor, edge);
    }
    const sort = (group: Map<string, TreeEntry>) => [...group.values()];
    const byImportance = (a: TreeEntry, b: TreeEntry) =>
      (b.node.citedBy || 0) - (a.node.citedBy || 0) ||
      a.node.label.localeCompare(b.node.label);
    const allFollowups = sort(groups.followups).sort(byImportance);
    return {
      methods: sort(groups.methods),
      related: sort(groups.related).sort(byImportance).slice(0, 2),
      references: sort(groups.references).sort(byImportance).slice(0, 2),
      followups: allFollowups.slice(0, 4),
      followupCount: allFollowups.length,
      linksByNode: edgesByNode,
    };
  }, [centerId, links, nodes]);

  const middleCount = related.length + 1;
  const middleCenterIndex = Math.floor(middleCount / 2);
  const middle: TreeEntry[] = [];
  let relatedIndex = 0;
  for (let index = 0; index < middleCount; index += 1)
    middle.push(
      index === middleCenterIndex
        ? { node: center, relations: [] }
        : related[relatedIndex++],
    );

  const maxRowCount = Math.max(
    middle.length,
    references.length,
    followups.length,
    1,
  );
  const cardWidth = viewportWidth < 840 ? 150 : 176;
  const treeWidth = Math.min(
    1240,
    Math.max(viewportWidth - 24, maxRowCount * (cardWidth + 20) + 48, 680),
  );
  const treeHeight = 740;
  const referenceY = 146;
  const middleY = 344;
  const bottomY = 570;
  const centers = (count: number) =>
    Array.from(
      { length: count },
      (_, index) => (treeWidth / (count + 1)) * (index + 1),
    );
  const referenceX = centers(references.length);
  const middleX = centers(middle.length);
  const followupX = centers(followups.length);
  const centerX = middleX[middleCenterIndex];
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = Math.max(
      0,
      centerX - scrollRef.current.clientWidth / 2,
    );
  }, [centerX, treeWidth, viewportWidth]);
  const edgeFor = (id: string, predicate: (edge: GraphEdge) => boolean) =>
    linksByNode.get(id)?.find(predicate);

  const lines = [
    ...references.map((entry, index) => ({
      id: `reference-${entry.node.id}`,
      edge: edgeFor(entry.node.id, (edge) => edge.type === '引用' && edge.source === center.id),
      d: `M ${centerX} ${middleY} V ${middleY - 36} H ${referenceX[index]} V ${referenceY + 94}`,
    })),
    ...related.map((entry) => {
      const index = middle.findIndex((item) => item.node.id === entry.node.id);
      const x = middleX[index];
      const edge = edgeFor(entry.node.id, (item) => item.type !== '引用' && item.type !== '后续工作候选');
      const sourceX = edge?.source === center.id ? centerX : x;
      const targetX = edge?.target === center.id ? centerX : x;
      const direction = Math.sign(targetX - sourceX) || 1;
      const start = sourceX + direction * (cardWidth / 2);
      const end = targetX - direction * (cardWidth / 2);
      return {
        id: `related-${entry.node.id}`,
        edge,
        d: `M ${start} ${middleY + 56} H ${end}`,
      };
    }),
    ...followups.map((entry, index) => {
      const edge = edgeFor(entry.node.id, (item) =>
        (item.type === '引用' && item.target === center.id) || item.type === '后续工作候选',
      );
      const candidateFlowsDown = edge?.source === center.id;
      return {
        id: `followup-${entry.node.id}`,
        edge,
        d: candidateFlowsDown
          ? `M ${centerX} ${middleY + 112} V ${middleY + 150} H ${followupX[index]} V ${bottomY}`
          : `M ${followupX[index]} ${bottomY} V ${middleY + 150} H ${centerX} V ${middleY + 112}`,
      };
    }),
  ];

  const nodeCard = (
    entry: TreeEntry,
    x: number,
    y: number,
    className = '',
    isCenter = false,
  ) => (
    <article
      key={entry.node.id}
      className={`tree-node ${className}`}
      style={{ left: x - cardWidth / 2, top: y }}
      tabIndex={isCenter ? 0 : undefined}
    >
      {isCenter ? (
        <>
          <div className="tree-node-kind">检索论文 · 中心</div>
          <strong title={entry.node.title}>{entry.node.label}</strong>
          <div className="tree-node-actions" aria-label="中心论文关系视图">
            <button onClick={() => onNavigate('datasets')}>数据集</button>
          </div>
        </>
      ) : (
        <button
          className="tree-node-open"
          onClick={() => onSelect(entry.node.id)}
          title={entry.node.title}
        >
          <span className="tree-node-kind">
            {kindNames[entry.node.kind]}
            {entry.node.year ? ` · ${entry.node.year}` : ''}
          </span>
          <strong>{entry.node.label}</strong>
          <span className="tree-node-relations">
            {entry.relations.join(' · ')}
          </span>
        </button>
      )}
    </article>
  );

  return (
    <div ref={scrollRef} className="relationship-tree-scroll">
      <div
        className="relationship-tree"
        style={{ width: treeWidth, height: treeHeight }}
      >
        <svg
          className="relationship-tree-lines"
          width={treeWidth}
          height={treeHeight}
          aria-label="论文关系连线"
        >
          <defs>
            <marker id="tree-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {lines.map(
            (line) =>
              line.edge && (
                <path
                  key={line.id}
                  d={line.d}
                  className="relationship-tree-line"
                  markerEnd="url(#tree-arrow)"
                  onClick={() => onEdge(line.edge!)}
                  aria-label={`编辑关系：${line.edge.type}`}
                />
              ),
          )}
        </svg>
        <div className="tree-annotations" aria-label="方法与研究领域">
          <span className="tree-annotation-title">方法与领域</span>
          {methods.map((entry) => (
            <span className={`tree-annotation ${entry.node.kind === 'field' ? 'field' : 'method'}`} key={entry.node.id} title={entry.node.title}>
              {entry.node.label}
            </span>
          ))}
        </div>
        <div className="tree-tier-heading" style={{ top: 107 }}>
          <span className="tree-tier-label">重要参考文献</span>
          <button onClick={() => onNavigate('references')}>更多参考文献 →</button>
        </div>
        {references.map((entry, index) =>
          nodeCard(entry, referenceX[index], referenceY, 'tree-node-reference'),
        )}
        {!references.length && (
          <div className="tree-empty-row" style={{ top: referenceY + 34 }}>
            尚未载入参考文献
          </div>
        )}
        <div className="tree-tier-heading" style={{ top: 305 }}>
          <span className="tree-tier-label">检索论文与相关论文</span>
          <button onClick={() => onNavigate('related')}>更多相关论文 →</button>
        </div>
        {middle.map((entry, index) =>
          nodeCard(
            entry,
            middleX[index],
            middleY + (entry.node.id === center.id ? 0 : 9),
            entry.node.id === center.id
              ? 'tree-node-center'
              : 'tree-node-related',
            entry.node.id === center.id,
          ),
        )}
        <div className="tree-tier-heading" style={{ top: 530 }}>
          <span className="tree-tier-label">后续研究 · 引用当前论文的工作</span>
          <button onClick={() => onNavigate('citations')}>更多后续研究 →</button>
        </div>
        {followups.map((entry, index) =>
          nodeCard(entry, followupX[index], bottomY, 'tree-node-followup'),
        )}
        {!methods.length && !related.length && !references.length && !followupCount && (
          <div className="tree-no-relations">
            当前论文还没有已载入的方法、相关论文或后续研究关系。
          </div>
        )}
      </div>
    </div>
  );
}

export default function GraphCanvas({
  graph,
  selected,
  preferredScope,
  focus,
  connecting,
  editable,
  onSelect,
  onEdge,
  onMove,
  onConnect,
  onFocusSelected,
  onReset,
  onScopeChange,
  loadingReferences,
  loadingCitations,
  citationState,
  citationCount,
  onRetryCitations,
}: {
  graph: Graph;
  selected: string;
  preferredScope: RelationScope;
  focus: string | null;
  connecting: boolean;
  editable: boolean;
  onSelect: (id: string) => void;
  onEdge: (edge: GraphEdge) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: () => void;
  onFocusSelected: () => void;
  onReset: () => void;
  onScopeChange: (scope: RelationScope) => void | Promise<void>;
  loadingReferences: boolean;
  loadingCitations: boolean;
  citationState?: string;
  citationCount?: number;
  onRetryCitations: () => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const force = useRef<any>(null);
  const lastAutoFit = useRef('');
  const [ForceGraph, setForceGraph] = useState<ComponentType<any> | null>(null);
  const [SpriteText, setSpriteText] = useState<any>(null);
  const [Three, setThree] = useState<typeof import('three') | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [size, setSize] = useState({ width: 900, height: 620 });
  const [scope, setScope] = useState<RelationScope>('insight');
  const [confirmed, setConfirmed] = useState(false);
  const [hidden, setHidden] = useState<NodeKind[]>([]);
  const [limit, setLimit] = useState(42);
  const hover = useRef({ node: '', link: '' });
  const [guide, setGuide] = useState(true);
  const [orbiting, setOrbiting] = useState(false);
  const [effects, setEffects] = useState(true);
  const effectsRef = useRef(effects);
  const fitPadding = Math.min(52, Math.max(36, Math.round(size.width * 0.04)));
  const researchStamp = graph.nodes.find((node) => node.id === focus)?.research
    ?.generatedAt;

  useEffect(() => {
    let active = true;
    setLoadError('');
    const loadTimer = window.setTimeout(() => {
      if (active) setLoadError('3D 星图资源加载超时，请检查网络后重试。');
    }, 12000);
    Promise.all([
      import('react-force-graph-3d'),
      import('three-spritetext'),
      import('three'),
    ])
      .then(([graphModule, textModule, threeModule]) => {
        if (!active) return;
        window.clearTimeout(loadTimer);
        setForceGraph(() => graphModule.default);
        setSpriteText(() => textModule.default);
        setThree(threeModule);
      })
      .catch(() => {
        if (!active) return;
        window.clearTimeout(loadTimer);
        setForceGraph(null);
        setLoadError('3D 星图资源加载失败，请检查网络后重试。');
      });
    return () => {
      active = false;
      window.clearTimeout(loadTimer);
    };
  }, [loadRevision]);

  useEffect(() => {
    if (!canvas.current) return;
    const resize = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize({
        width: Math.max(320, Math.round(box.width)),
        height: Math.max(380, Math.round(box.height)),
      });
    });
    resize.observe(canvas.current);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      setEffects(false);
  }, []);

  useEffect(() => {
    effectsRef.current = effects;
  }, [effects]);

  useEffect(() => {
    const nextScope = focus ? preferredScope : 'all';
    setLimit(nextScope === 'references' ? 5 : 42);
    setScope(nextScope);
  }, [focus, researchStamp, preferredScope]);

  const visible = useMemo(
    () => graphView(graph, focus, { scope, confirmed, hidden, limit }),
    [graph, focus, scope, confirmed, hidden, limit],
  );
  const graphData = useMemo(() => {
    const nodes: StarNode[] = visible.graph.nodes.map((node) => ({
      ...node,
      x:
        node.id === focus ? 0 : node.x == null ? undefined : (node.x - 500) / 9,
      y:
        node.id === focus ? 0 : node.y == null ? undefined : (node.y - 370) / 9,
      z: node.id === focus ? 0 : stableDepth(node.id),
      ...(node.id === focus
        ? { fx: 0, fy: 0, fz: 0 }
        : { fz: stableDepth(node.id) }),
    }));
    const links: StarLink[] = visible.graph.edges.map((edge) => ({
      ...edge,
      source: edge.source,
      target: edge.target,
    }));
    return { nodes, links };
  }, [visible.graph, focus]);
  const autoFitPadding =
    graphData.nodes.length <= 3
      ? size.width < 600
        ? 90
        : 150
      : size.width < 600
        ? Math.max(fitPadding, 58)
        : fitPadding;
  const lens = useMemo(() => {
    const nodeIds = new Set<string>(selected ? [selected] : []);
    const edgeIds = new Set<string>();
    const counts = new Map<RelationFamily, number>();
    graphData.links.forEach((link) => {
      const source = nodeId(link.source);
      const target = nodeId(link.target);
      if (source !== selected && target !== selected) return;
      nodeIds.add(source);
      nodeIds.add(target);
      edgeIds.add(link.id);
      const family = relationFamily(link);
      counts.set(family, (counts.get(family) || 0) + 1);
    });
    return { nodeIds, edgeIds, counts };
  }, [graphData.links, selected]);
  const lensActive =
    !focus &&
    !!selected &&
    graphData.nodes.length > 1 &&
    graphData.nodes.some((node) => node.id === selected);
  const labeledLinkCount = lensActive
    ? lens.edgeIds.size
    : graphData.links.length;
  const relationLabelBudget = size.width < 640 ? 4 : 10;
  const showRelationLabels =
    labeledLinkCount > 0 && labeledLinkCount <= relationLabelBudget;
  const selectedNode = graphData.nodes.find((node) => node.id === selected);
  const treeCenter =
    (selectedNode?.kind === 'paper' && selectedNode) ||
    graphData.nodes.find((node) => node.id === focus && node.kind === 'paper') ||
    graphData.nodes.find((node) => node.kind === 'paper');
  const lensCounts = [...lens.counts.entries()].sort((a, b) => b[1] - a[1]);
  const labeledNodeIds = useMemo(() => {
    const budget = size.width < 640 ? 14 : 30;
    const priority = graphData.nodes.filter(
      (node) =>
        node.id === selected ||
        node.id === focus ||
        (lensActive && lens.nodeIds.has(node.id)),
    );
    const remaining = graphData.nodes.filter(
      (node) => !priority.some((item) => item.id === node.id),
    );
    return new Set(
      [...priority, ...remaining].slice(0, budget).map((node) => node.id),
    );
  }, [focus, graphData.nodes, lens.nodeIds, lensActive, selected, size.width]);

  const focusNode = useCallback(
    (node: StarNode, duration = 900) => {
      if (!force.current || node.x == null || node.y == null || node.z == null)
        return;
      const distance = size.width < 600 ? 240 : 210;
      force.current.cameraPosition(
        {
          x: node.x + distance * 0.22,
          y: node.y + distance * 0.1,
          z: node.z + distance,
        },
        { x: node.x, y: node.y, z: node.z },
        duration,
      );
    },
    [size.width],
  );

  useEffect(() => {
    if (!ForceGraph || !force.current || graphData.nodes.length === 0) return;
    lastAutoFit.current = '';
    const timer = window.setTimeout(() => {
      if (graphData.nodes.length === 1) {
        focusNode(graphData.nodes[0], 420);
        return;
      }
      force.current?.zoomToFit?.(520, autoFitPadding);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [
    ForceGraph,
    size.width,
    size.height,
    fitPadding,
    autoFitPadding,
    focusNode,
    graphData.nodes,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const node = focus
        ? graphData.nodes.find((item) => item.id === focus)
        : undefined;
      if (node) focusNode(node, 520);
      else force.current?.zoomToFit?.(520, autoFitPadding);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [focus, graphData.nodes, focusNode, autoFitPadding]);

  useEffect(() => {
    const controls = force.current?.controls?.();
    if (!controls) return;
    controls.autoRotate = orbiting;
    controls.autoRotateSpeed = 0.45;
  }, [orbiting, ForceGraph]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const linkForce = force.current?.d3Force?.('link');
      linkForce?.distance?.((link: StarLink) =>
        graphData.nodes.length <= 3
          ? 92
          : relationFamily(link) === 'citation'
            ? 48
            : 56,
      );
      force.current
        ?.d3Force?.('charge')
        ?.strength?.(graphData.nodes.length <= 3 ? -140 : -88);
      force.current?.d3ReheatSimulation?.();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [ForceGraph, graphData.nodes.length, graphData.links.length]);

  const nodeObject = useCallback(
    (node: StarNode) => {
      if (!SpriteText || !Three) return undefined;
      const selectedNode = node.id === selected;
      const mutedNode = lensActive && !lens.nodeIds.has(node.id);
      const compactLabel = size.width < 640;
      const group = new Three.Group();
      const geometry =
        node.kind === 'paper'
          ? new Three.SphereGeometry(4.4, 22, 14)
          : node.kind === 'method'
            ? new Three.OctahedronGeometry(5.1, 0)
            : node.kind === 'field'
              ? new Three.IcosahedronGeometry(4.8, 0)
              : new Three.BoxGeometry(7.2, 7.2, 7.2);
      const material = new Three.MeshPhysicalMaterial({
        color: colors[node.kind],
        emissive: colors[node.kind],
        emissiveIntensity: mutedNode ? 0.02 : selectedNode ? 0.42 : 0.14,
        metalness: 0.18,
        roughness: 0.3,
        clearcoat: 0.72,
        clearcoatRoughness: 0.24,
        transparent: true,
        opacity: mutedNode ? 0.16 : 0.98,
      });
      const mesh = new Three.Mesh(geometry, material);
      const baseScale = selectedNode ? 1.18 : 1;
      const phase = Math.abs(stableDepth(node.id)) * 0.73;
      mesh.scale.setScalar(baseScale);
      mesh.onBeforeRender = () => {
        const pulse = effectsRef.current
          ? 1 +
            Math.sin(performance.now() / (selectedNode ? 720 : 1250) + phase) *
              (selectedNode ? 0.045 : 0.016)
          : 1;
        mesh.scale.setScalar(baseScale * pulse);
      };
      group.add(mesh);

      if (selectedNode) {
        const ringMaterial = new Three.MeshBasicMaterial({
          color: '#dce9ff',
          transparent: true,
          opacity: 0.72,
        });
        const ring = new Three.Mesh(
          new Three.TorusGeometry(7.1, 0.13, 8, 36),
          ringMaterial,
        );
        const orbit = new Three.Group();
        const dotGeometry = new Three.SphereGeometry(0.42, 12, 8);
        const dotMaterial = new Three.MeshBasicMaterial({
          color: '#9fc0ff',
          transparent: true,
          opacity: 0.88,
        });
        [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].forEach((angle) => {
          const dot = new Three.Mesh(dotGeometry, dotMaterial);
          dot.position.set(Math.cos(angle) * 7.6, Math.sin(angle) * 7.6, 0);
          orbit.add(dot);
        });
        orbit.rotation.x = 0.78;
        orbit.rotation.y = 0.32;
        ring.onBeforeRender = () => {
          const time = performance.now();
          ringMaterial.opacity = effectsRef.current
            ? 0.52 + Math.sin(time / 650) * 0.16
            : 0.72;
          ring.scale.setScalar(
            effectsRef.current ? 1 + Math.sin(time / 820) * 0.035 : 1,
          );
          orbit.rotation.z = effectsRef.current ? time / 1850 : 0;
        };
        group.add(ring);
        group.add(orbit);
      }

      if (
        !mutedNode &&
        (labeledNodeIds.has(node.id) || selectedNode || node.id === focus)
      ) {
        const shortLabel =
          node.label.length > 25 ? `${node.label.slice(0, 23)}…` : node.label;
        const text = new SpriteText(
          `${symbols[node.kind]} ${shortLabel}`,
          selectedNode
            ? compactLabel
              ? 3.05
              : 3.8
            : compactLabel
              ? 2.25
              : 2.85,
          node.id === selected ? '#ffffff' : '#dce9ff',
        );
        text.backgroundColor = selectedNode
          ? 'rgba(10, 24, 49, .92)'
          : 'rgba(4, 11, 28, .30)';
        text.padding = selectedNode ? 1.5 : 0.78;
        text.borderRadius = 1.8;
        if (!selectedNode) {
          text.strokeWidth = 0.14;
          text.strokeColor = '#020612';
        }
        text.position.y = selectedNode ? -11.1 : -8.7;
        text.material.depthWrite = false;
        group.add(text);
      }
      return group;
    },
    [
      SpriteText,
      Three,
      selected,
      focus,
      labeledNodeIds,
      lensActive,
      lens.nodeIds,
      size.width,
    ],
  );
  const linkObject = useCallback(
    (link: StarLink) => {
      if (!SpriteText || !Three) return undefined;
      if (lensActive && !lens.edgeIds.has(link.id)) return new Three.Group();
      const family = relationFamily(link);
      const meta = relationMeta[family];
      const sprite = new SpriteText(
        relationBadge(link, focus),
        size.width < 640 ? 1.45 : 2.05,
        meta.color,
      );
      sprite.backgroundColor = meta.background;
      sprite.padding = 0.82;
      sprite.borderRadius = 1.5;
      sprite.material.depthWrite = false;
      return sprite;
    },
    [SpriteText, Three, focus, lensActive, lens.edgeIds, size.width],
  );
  const positionLinkLabel = useCallback(
    (
      sprite: { position: { set: (x: number, y: number, z: number) => void } },
      {
        start,
        end,
      }: {
        start: { x: number; y: number; z: number };
        end: { x: number; y: number; z: number };
      },
    ) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const planarLength = Math.hypot(dx, dy) || 1;
      const labelOffset = 3.4;
      sprite.position.set(
        start.x + dx / 2 - (dy / planarLength) * labelOffset,
        start.y + dy / 2 + (dx / planarLength) * labelOffset + 1,
        start.z + (end.z - start.z) / 2,
      );
      return true;
    },
    [],
  );
  const linkHovered = useCallback((link: StarLink) => {
    const source = nodeId(link.source);
    const target = nodeId(link.target);
    return (
      link.id === hover.current.link ||
      source === hover.current.node ||
      target === hover.current.node
    );
  }, []);
  const nodeTooltip = useCallback(
    (node: StarNode) =>
      `<b>${symbols[node.kind]} ${escape(node.label)}</b><br>${escape(kindNames[node.kind])}${node.year ? ` · ${node.year}` : ''}`,
    [],
  );
  const linkTooltip = useCallback(
    (link: StarLink) =>
      `<b>${escape(link.type)}</b>${link.description ? `<br>${escape(link.description.slice(0, 120))}` : ''}`,
    [],
  );
  const getLinkColor = useCallback(
    (link: StarLink) => {
      if (linkHovered(link)) return '#b8d7ff';
      if (lensActive && !lens.edgeIds.has(link.id)) return '#132039';
      return relationMeta[relationFamily(link)].color;
    },
    [lens.edgeIds, lensActive, linkHovered],
  );
  const getLinkWidth = useCallback(
    (link: StarLink) => {
      if (lensActive && !lens.edgeIds.has(link.id)) return 0.22;
      if (lensActive && lens.edgeIds.has(link.id)) return 1.18;
      const family = relationFamily(link);
      if (family === 'method' || family === 'comparison') return 1.05;
      if (family === 'dataset' || family === 'field') return 0.9;
      return 0.62;
    },
    [lens.edgeIds, lensActive],
  );
  const getLinkCurvature = useCallback(
    (link: StarLink) => (relationFamily(link) === 'related' ? 0.12 : 0),
    [],
  );
  const getArrowLength = useCallback(
    (link: StarLink) => {
      if (lensActive && !lens.edgeIds.has(link.id)) return 0;
      return relationFamily(link) === 'citation' ? 3.6 : 2.4;
    },
    [lens.edgeIds, lensActive],
  );
  const getParticleCount = useCallback(
    (link: StarLink) => {
      if (!effects || (lensActive && !lens.edgeIds.has(link.id))) return 0;
      if (linkHovered(link)) return 4;
      const center = focus || (lensActive ? selected : '');
      if (
        !center ||
        ![nodeId(link.source), nodeId(link.target)].includes(center)
      )
        return 0;
      return relationFamily(link) === 'citation' ? 2 : 1;
    },
    [effects, focus, lens.edgeIds, lensActive, linkHovered, selected],
  );
  const getParticleWidth = useCallback(
    (link: StarLink) =>
      linkHovered(link)
        ? 2.2
        : relationFamily(link) === 'citation'
          ? 1.45
          : 1.05,
    [linkHovered],
  );
  const getParticleSpeed = useCallback(
    (link: StarLink) =>
      relationFamily(link) === 'citation'
        ? 0.006
        : relationFamily(link) === 'method'
          ? 0.0025
          : 0.0018,
    [],
  );
  const getParticleColor = useCallback(
    (link: StarLink) => relationMeta[relationFamily(link)].color,
    [],
  );
  const refreshHover = useCallback((kind: 'node' | 'link', id = '') => {
    const next =
      kind === 'node' ? { node: id, link: '' } : { node: '', link: id };
    if (hover.current.node === next.node && hover.current.link === next.link)
      return;
    hover.current = next;
    force.current?.refresh?.();
  }, []);
  const fitLens = useCallback(() => {
    setGuide(false);
    if (selectedNode && lens.nodeIds.size <= 3) {
      focusNode(selectedNode, 650);
      return;
    }
    force.current?.zoomToFit?.(650, 68, (node: StarNode) =>
      lens.nodeIds.has(node.id),
    );
  }, [focusNode, lens.nodeIds, selectedNode]);
  function fit() {
    setGuide(false);
    force.current?.zoomToFit?.(800, autoFitPadding);
  }
  async function fullScreen() {
    setGuide(false);
    if (!document.fullscreenElement) await shell.current?.requestFullscreen?.();
    else await document.exitFullscreen();
  }

  return (
    <div
      ref={shell}
      className={`graph-stage star-stage ${scope === 'all' && treeCenter ? 'tree-mode' : ''} ${connecting ? 'connecting' : ''} ${effects ? 'motion-on' : 'motion-off'}`}
      onPointerMove={(event) => {
        const bounds = shell.current?.getBoundingClientRect();
        if (!bounds || !shell.current) return;
        shell.current.style.setProperty(
          '--glow-x',
          `${((event.clientX - bounds.left) / bounds.width) * 100}%`,
        );
        shell.current.style.setProperty(
          '--glow-y',
          `${((event.clientY - bounds.top) / bounds.height) * 100}%`,
        );
      }}
      onPointerLeave={() => {
        shell.current?.style.setProperty('--glow-x', '50%');
        shell.current?.style.setProperty('--glow-y', '46%');
      }}
    >
      <div className="star-ambience" aria-hidden="true">
        <i className="ambient-orb orb-one" />
        <i className="ambient-orb orb-two" />
        <i className="ambient-meteor meteor-one" />
        <i className="ambient-meteor meteor-two" />
        <i className="ambient-meteor meteor-three" />
      </div>
      <div className="star-toolbar" aria-label="关系筛选">
        <div className="scope-tabs">
          {(Object.entries(scopeLabels) as [RelationScope, string][]).map(
            ([key, label]) => {
              const ScopeIcon = scopeIcons[key];
              return (
                <button
                  key={key}
                  aria-pressed={scope === key}
                  onClick={() => {
                    setScope(key);
                    setLimit(key === 'references' ? 5 : 42);
                    void onScopeChange(key);
                  }}
                >
                  <ScopeIcon size={14} />
                  <span>{label}</span>
                </button>
              );
            },
          )}
        </div>
        <div className="star-kinds">
          {Object.entries(kindNames).map(([key, label]) => (
            <button
              key={key}
              className={hidden.includes(key as NodeKind) ? 'dim' : ''}
              onClick={() =>
                setHidden((old) =>
                  old.includes(key as NodeKind)
                    ? old.filter((item) => item !== key)
                    : [...old, key as NodeKind],
                )
              }
              aria-pressed={!hidden.includes(key as NodeKind)}
            >
              <i
                className={`kind-mark ${key}`}
                style={
                  { '--kind-color': colors[key as NodeKind] } as CSSProperties
                }
              />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <label className="verified-toggle">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          仅看已核验
        </label>
      </div>

      <div ref={canvas} className="star-canvas">
        {scope === 'all' && treeCenter ? (
          <RelationshipTree
            nodes={graphData.nodes}
            links={graphData.links}
            centerId={treeCenter.id}
            width={size.width}
            onSelect={onSelect}
            onEdge={onEdge}
            onNavigate={(nextScope) => {
              setScope(nextScope);
              setLimit(nextScope === 'references' ? 5 : 42);
              void onScopeChange(nextScope);
            }}
          />
        ) : scope === 'all' ? (
          <div className="relationship-tree-no-center">
            请选择一篇论文作为关系树中心。
          </div>
        ) : ForceGraph && Three && SpriteText ? (
          <ForceGraph
            ref={force}
            width={size.width}
            height={size.height}
            graphData={graphData}
            rendererConfig={{ antialias: true, alpha: true }}
            backgroundColor="rgba(0,0,0,0)"
            controlType="orbit"
            showNavInfo={false}
            nodeLabel={nodeTooltip}
            nodeThreeObject={nodeObject}
            linkThreeObject={showRelationLabels ? linkObject : undefined}
            linkThreeObjectExtend={showRelationLabels}
            linkPositionUpdate={
              showRelationLabels ? positionLinkLabel : undefined
            }
            linkColor={getLinkColor}
            linkWidth={getLinkWidth}
            linkOpacity={0.68}
            linkCurvature={getLinkCurvature}
            linkDirectionalArrowLength={getArrowLength}
            linkDirectionalArrowRelPos={0.92}
            linkDirectionalParticles={getParticleCount}
            linkDirectionalParticleWidth={getParticleWidth}
            linkDirectionalParticleSpeed={getParticleSpeed}
            linkDirectionalParticleColor={getParticleColor}
            linkLabel={linkTooltip}
            warmupTicks={120}
            cooldownTicks={110}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.22}
            onEngineStop={() => {
              const key = `${size.width}x${size.height}:${focus || 'all'}:${graphData.nodes
                .map((node) => node.id)
                .sort()
                .join('|')}:${graphData.links
                .map((link) => link.id)
                .sort()
                .join('|')}`;
              if (lastAutoFit.current === key) return;
              lastAutoFit.current = key;
              if (graphData.nodes.length === 1) {
                focusNode(graphData.nodes[0], 450);
                return;
              }
              force.current?.zoomToFit?.(650, autoFitPadding);
            }}
            onNodeClick={(node: StarNode) => {
              setGuide(false);
              focusNode(node);
              onSelect(node.id);
            }}
            onNodeHover={(node: StarNode | null) => {
              refreshHover('node', node?.id);
              if (canvas.current)
                canvas.current.style.cursor = node
                  ? connecting
                    ? 'crosshair'
                    : 'pointer'
                  : 'grab';
            }}
            onNodeDragEnd={(node: StarNode) => {
              node.fx = node.x;
              node.fy = node.y;
              node.fz = node.z;
              if (node.id !== focus && node.x != null && node.y != null)
                onMove(node.id, 500 + node.x * 9, 370 + node.y * 9);
            }}
            onLinkClick={(link: StarLink) => {
              setGuide(false);
              onEdge({
                ...link,
                source: nodeId(link.source),
                target: nodeId(link.target),
              });
            }}
            onLinkHover={(link: StarLink | null) => {
              refreshHover('link', link?.id);
              if (canvas.current)
                canvas.current.style.cursor = link ? 'pointer' : 'grab';
            }}
            onBackgroundClick={() => setGuide(false)}
          />
        ) : loadError ? (
          <div className="star-loading star-error" role="alert">
            <CircleHelp />
            <strong>{loadError}</strong>
            <button onClick={() => setLoadRevision((value) => value + 1)}>
              重新加载 3D 星图
            </button>
          </div>
        ) : (
          <div className="star-loading">
            <LoaderCircle className="spin" />
            正在建立 3D 论文星图…
          </div>
        )}
      </div>

      {connecting && (
        <div className="connect-banner">
          起点已选中，请点击另一个星点建立关系
        </div>
      )}
      {lensActive && selectedNode && (
        <div className="relation-lens-card" aria-live="polite">
          <div className="lens-card-heading">
            <div>
              <span>关系透镜</span>
              <strong>{selectedNode.label}</strong>
            </div>
            <div className="lens-card-actions">
              <button onClick={fitLens} title="定位一跳关系">
                <Focus size={15} />
                定位一跳
              </button>
              <button
                className="lens-open"
                onClick={onFocusSelected}
                title="进入所选节点的关系网"
              >
                <Network size={15} />
                打开关系网
              </button>
            </div>
          </div>
          <p>
            {kindNames[selectedNode.kind]}
            {selectedNode.year ? ` · ${selectedNode.year}` : ''} ·{' '}
            {Math.max(0, lens.nodeIds.size - 1)} 个邻居 · {lens.edgeIds.size}{' '}
            条直接关系
          </p>
          <div className="lens-counts">
            {lensCounts.slice(0, 5).map(([family, count]) => (
              <span key={family}>
                {relationMeta[family].symbol} {relationMeta[family].label}{' '}
                <b>{count}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      {guide && scope !== 'all' && !lensActive && graphData.nodes.length > 1 && (
        <div className="star-guide">
          <button onClick={() => setGuide(false)} aria-label="关闭使用提示">
            ×
          </button>
          <CircleHelp size={19} />
          <div>
            <strong>先看形状，再看连线</strong>
            <p>● 论文　◆ 方法　⬢ 领域　■ 数据集</p>
            <p>线中标签说明关系 · 箭头看方向 · ✨ 开关动态</p>
          </div>
        </div>
      )}
      {graphData.nodes.length <= (focus ? 1 : 0) && (
        <div className="graph-empty star-empty">
          <strong>这里还没有可见关系</strong>
          <span>
            {scope === 'references'
              ? loadingReferences
                ? '正在查询参考文献，完成后优先展示被引次数较高的前 5 篇。'
                : '暂无已载入的参考文献。选择论文后会自动查询，也可在右侧重新展开。'
              : scope === 'citations'
                ? loadingCitations
                  ? '正在查询引用当前论文的后续工作…'
                  : citationState === 'failed'
                    ? '上次查询被引用来源失败，可能是数据源限流。可以稍后重试。'
                    : citationState === 'ok' && citationCount === 0
                      ? '当前数据源暂未返回被引用论文，可以重新查询。'
                      : '暂无已载入的被引用论文。点击下方按钮查询引用当前论文的后续工作。'
              : '清除筛选，或在右侧点击“以此节点为中心”生成研究星图。'}
          </span>
          {scope === 'citations' ? (
            <button onClick={onRetryCitations} disabled={loadingCitations}>
              重新查询被引用论文
            </button>
          ) : (
            <button
              onClick={() => {
                setScope('all');
                setConfirmed(false);
                setHidden([]);
              }}
            >
              清除筛选
            </button>
          )}
        </div>
      )}
      {visible.omitted > 0 && (
        <button
          className="show-more-nodes"
          onClick={() => setLimit((old) => old + 42)}
        >
          再显示 42 个节点（剩余 {visible.omitted}）
        </button>
      )}

      <div className="star-legend">
        <span>{graphData.nodes.length} 个节点</span>
        <span>{graphData.links.length} 条关系</span>
        <span>
          {scope === 'all'
            ? '关系树 · 悬浮中心论文可切换视图'
            : lensActive
            ? `关系透镜 · ${Math.max(0, lens.nodeIds.size - 1)} 个邻居`
            : effects
              ? '流光沿关系方向移动'
              : '动态已关闭 · 箭头仍表示方向'}
        </span>
      </div>
      {scope !== 'all' && <div className="star-tools">
        <Button
          variant={connecting ? 'secondary' : 'ghost'}
          size="icon"
          onClick={onConnect}
          disabled={!editable}
          title={editable ? '手动连线' : '登录后可手动连线'}
          aria-label="手动连线"
        >
          <Link2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={fit}
          title="适应全部节点"
          aria-label="适应全部节点"
        >
          <Focus />
        </Button>
        <Button
          variant={effects ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => setEffects((old) => !old)}
          title={effects ? '关闭动态氛围' : '开启动态氛围'}
          aria-label="动态氛围"
          aria-pressed={effects}
        >
          <Sparkles />
        </Button>
        <Button
          variant={orbiting ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => setOrbiting((old) => !old)}
          title="自动巡航"
          aria-label="自动巡航"
        >
          <Orbit />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void fullScreen()}
          title="全屏星图"
          aria-label="全屏星图"
        >
          <Maximize2 />
        </Button>
        {focus && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onReset}
            title="查看完整图谱"
            aria-label="查看完整图谱"
          >
            <RotateCcw />
          </Button>
        )}
      </div>}
    </div>
  );
}
