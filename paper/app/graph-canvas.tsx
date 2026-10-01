'use client';

import {
  useCallback,
  useEffect,
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
import {
  graphView,
  scopeLabels,
  type RelationScope,
} from '@/lib/graph-view';
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
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
      char
    ] || char,
  );
const stableDepth = (id: string) => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1)
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return ((Math.abs(hash) % 13) - 6) * 1.35;
};

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
  onReset,
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
  onReset: () => void;
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
  const [hovered, setHovered] = useState('');
  const [guide, setGuide] = useState(true);
  const [orbiting, setOrbiting] = useState(false);
  const fitPadding = Math.min(
    52,
    Math.max(36, Math.round(size.width * 0.04)),
  );
  const researchStamp = graph.nodes.find((node) => node.id === focus)?.research
    ?.generatedAt;

  useEffect(() => {
    let active = true;
    setLoadError('');
    const loadTimer = window.setTimeout(() => {
      if (active)
        setLoadError('3D 星图资源加载超时，请检查网络后重试。');
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
    setLimit(42);
    setScope(focus ? preferredScope : 'all');
  }, [focus, researchStamp, preferredScope]);

  const visible = useMemo(
    () => graphView(graph, focus, { scope, confirmed, hidden, limit }),
    [graph, focus, scope, confirmed, hidden, limit],
  );
  const graphData = useMemo(() => {
    const nodes: StarNode[] = visible.graph.nodes.map((node) => ({
      ...node,
      x: node.id === focus ? 0 : node.x == null ? undefined : (node.x - 500) / 9,
      y: node.id === focus ? 0 : node.y == null ? undefined : (node.y - 370) / 9,
      z: node.id === focus ? 0 : stableDepth(node.id),
      ...(node.id === focus ? { fx: 0, fy: 0, fz: 0 } : {}),
    }));
    const links: StarLink[] = visible.graph.edges.map((edge) => ({
      ...edge,
      source: edge.source,
      target: edge.target,
    }));
    return { nodes, links };
  }, [visible.graph, focus]);

  const focusNode = useCallback((node: StarNode, duration = 900) => {
    if (!force.current || node.x == null || node.y == null || node.z == null)
      return;
    const length = Math.hypot(node.x, node.y, node.z) || 1;
    const distance = 105;
    const ratio = 1 + distance / length;
    force.current.cameraPosition(
      length < 4
        ? { x: 0, y: 0, z: distance }
        : { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      { x: node.x, y: node.y, z: node.z },
      duration,
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const node = focus
        ? graphData.nodes.find((item) => item.id === focus)
        : undefined;
      if (node) focusNode(node, 520);
      else force.current?.zoomToFit?.(520, fitPadding);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [focus, graphData.nodes, focusNode, fitPadding]);

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
        relationFamily(link) === 'citation' ? 48 : 56,
      );
      force.current?.d3Force?.('charge')?.strength?.(-88);
      force.current?.d3ReheatSimulation?.();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [ForceGraph, graphData.nodes.length, graphData.links.length]);

  function nodeId(value: string | StarNode) {
    return typeof value === 'string' ? value : value.id;
  }
  function linkActive(link: StarLink) {
    const source = nodeId(link.source),
      target = nodeId(link.target);
    return source === hovered || target === hovered || link.id === hovered;
  }
  function relationFamily(link: StarLink) {
    if (link.type === '引用') return 'citation';
    if (link.type === '实验数据集') return 'dataset';
    if (
      [
        '使用方法',
        '提出模块',
        '研究领域',
        '对比方法',
        '直接 baseline',
        '方法借鉴',
        '技术关联',
        '可借鉴方法',
      ].includes(link.type)
    )
      return 'method';
    return 'related';
  }
  const nodeObject = useCallback((node: StarNode) => {
    if (!SpriteText || !Three) return undefined;
    const selectedNode = node.id === selected;
    const group = new Three.Group();
    const geometry =
      node.kind === 'paper'
        ? new Three.SphereGeometry(4.4, 28, 18)
        : node.kind === 'method'
          ? new Three.OctahedronGeometry(5.1, 0)
          : node.kind === 'field'
            ? new Three.IcosahedronGeometry(4.8, 0)
            : new Three.BoxGeometry(7.2, 7.2, 7.2, 2, 2, 2);
    const material = new Three.MeshPhysicalMaterial({
      color: colors[node.kind],
      emissive: colors[node.kind],
      emissiveIntensity: selectedNode ? 0.42 : 0.14,
      metalness: 0.18,
      roughness: 0.3,
      clearcoat: 0.72,
      clearcoatRoughness: 0.24,
      transparent: true,
      opacity: 0.98,
    });
    const mesh = new Three.Mesh(geometry, material);
    mesh.scale.setScalar(selectedNode ? 1.18 : 1);
    group.add(mesh);

    if (selectedNode) {
      const ring = new Three.Mesh(
        new Three.TorusGeometry(7.1, 0.13, 8, 64),
        new Three.MeshBasicMaterial({
          color: '#dce9ff',
          transparent: true,
          opacity: 0.72,
        }),
      );
      group.add(ring);
    }

    const shortLabel =
      node.label.length > 25 ? `${node.label.slice(0, 23)}…` : node.label;
    const text = new SpriteText(`${symbols[node.kind]} ${shortLabel}`);
    text.color = node.id === selected ? '#ffffff' : '#dce9ff';
    text.textHeight = selectedNode ? 3.8 : 2.35;
    text.backgroundColor = selectedNode
      ? 'rgba(10, 24, 49, .92)'
      : 'rgba(4, 11, 28, .18)';
    text.padding = selectedNode ? 1.5 : 0.65;
    text.borderRadius = 1.8;
    text.strokeWidth = selectedNode ? 0 : 0.16;
    text.strokeColor = '#020612';
    text.position.y = selectedNode ? -11.1 : -8.5;
    text.material.depthWrite = false;
    group.add(text);
    return group;
  }, [SpriteText, Three, selected]);
  function fit() {
    setGuide(false);
    force.current?.zoomToFit?.(800, fitPadding);
  }
  async function fullScreen() {
    setGuide(false);
    if (!document.fullscreenElement) await shell.current?.requestFullscreen?.();
    else await document.exitFullscreen();
  }

  return (
    <div
      ref={shell}
      className={'graph-stage star-stage ' + (connecting ? 'connecting' : '')}
    >
      <div className="star-toolbar" aria-label="关系筛选">
        <div className="scope-tabs">
          {(Object.entries(scopeLabels) as [RelationScope, string][]).map(
            ([key, label]) => {
              const ScopeIcon = scopeIcons[key];
              return (
                <button
                  key={key}
                  aria-pressed={scope === key}
                  onClick={() => setScope(key)}
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
                style={{ '--kind-color': colors[key as NodeKind] } as CSSProperties}
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
        {ForceGraph && Three && SpriteText ? (
          <ForceGraph
            ref={force}
            width={size.width}
            height={size.height}
            graphData={graphData}
            rendererConfig={{ antialias: true, alpha: true }}
            backgroundColor="rgba(0,0,0,0)"
            controlType="orbit"
            showNavInfo={false}
            nodeLabel={(node: StarNode) =>
              `<b>${symbols[node.kind]} ${escape(node.label)}</b><br>${escape(kindNames[node.kind])}${node.year ? ` · ${node.year}` : ''}`
            }
            nodeThreeObject={nodeObject}
            linkColor={(link: StarLink) =>
              linkActive(link)
                ? '#8eb8ff'
                : link.status === 'candidate'
                  ? '#725c98'
                  : link.status === 'manual'
                    ? '#4f9e91'
                    : '#30496f'
            }
            linkWidth={(link: StarLink) =>
              linkActive(link)
                ? 1.7
                : relationFamily(link) === 'method'
                  ? 1.05
                  : relationFamily(link) === 'dataset'
                    ? 0.9
                    : 0.62
            }
            linkOpacity={0.68}
            linkCurvature={(link: StarLink) =>
              relationFamily(link) === 'related' ? 0.12 : 0
            }
            linkDirectionalArrowLength={(link: StarLink) =>
              relationFamily(link) === 'citation' ? 4.8 : 3.2
            }
            linkDirectionalArrowRelPos={0.92}
            linkDirectionalParticles={(link: StarLink) =>
              link.id === hovered
                ? 3
                : relationFamily(link) === 'citation'
                  ? 1
                  : 0
            }
            linkDirectionalParticleWidth={(link: StarLink) =>
              link.id === hovered ? 2 : 1.2
            }
            linkDirectionalParticleSpeed={(link: StarLink) =>
              relationFamily(link) === 'citation' ? 0.006 : 0.003
            }
            linkLabel={(link: StarLink) =>
              `<b>${escape(link.type)}</b>${link.description ? `<br>${escape(link.description.slice(0, 120))}` : ''}`
            }
            warmupTicks={120}
            cooldownTicks={110}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.22}
            onEngineStop={() => {
              const key = `${focus || 'all'}:${graphData.nodes
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
              force.current?.zoomToFit?.(650, fitPadding);
            }}
            onNodeClick={(node: StarNode) => {
              setGuide(false);
              focusNode(node);
              onSelect(node.id);
            }}
            onNodeHover={(node: StarNode | null) => {
              setHovered(node?.id || '');
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
            onLinkHover={(link: StarLink | null) => setHovered(link?.id || '')}
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
        <div className="connect-banner">起点已选中，请点击另一个星点建立关系</div>
      )}
      {guide && graphData.nodes.length > 1 && (
        <div className="star-guide">
          <button onClick={() => setGuide(false)} aria-label="关闭使用提示">×</button>
          <CircleHelp size={19} />
          <div>
            <strong>先看形状，再看连线</strong>
            <p>● 论文　◆ 方法　⬢ 领域　■ 数据集</p>
            <p>点节点选中心 · 箭头看方向 · 点连线核对关系</p>
          </div>
        </div>
      )}
      {graphData.nodes.length <= (focus ? 1 : 0) && (
        <div className="graph-empty star-empty">
          <strong>这里还没有可见关系</strong>
          <span>清除筛选，或在右侧点击“以此节点为中心”生成研究星图。</span>
          <button
            onClick={() => {
              setScope('all');
              setConfirmed(false);
              setHidden([]);
            }}
          >
            清除筛选
          </button>
        </div>
      )}
      {visible.omitted > 0 && (
        <button className="show-more-nodes" onClick={() => setLimit((old) => old + 42)}>
          再显示 42 个节点（剩余 {visible.omitted}）
        </button>
      )}

      <div className="star-legend">
        <span>{graphData.nodes.length} 个节点</span>
        <span>{graphData.links.length} 条关系</span>
        <span>{hovered ? '已高亮相邻关系' : '箭头表示关系方向 · 流光表示引用'}</span>
      </div>
      <div className="star-tools">
        <Button variant={connecting ? 'secondary' : 'ghost'} size="icon" onClick={onConnect} disabled={!editable} title={editable ? '手动连线' : '登录后可手动连线'} aria-label="手动连线"><Link2 /></Button>
        <Button variant="ghost" size="icon" onClick={fit} title="适应全部节点" aria-label="适应全部节点"><Focus /></Button>
        <Button variant={orbiting ? 'secondary' : 'ghost'} size="icon" onClick={() => setOrbiting((old) => !old)} title="自动巡航" aria-label="自动巡航"><Orbit /></Button>
        <Button variant="ghost" size="icon" onClick={() => void fullScreen()} title="全屏星图" aria-label="全屏星图"><Maximize2 /></Button>
        {focus && <Button variant="ghost" size="icon" onClick={onReset} title="查看完整图谱" aria-label="查看完整图谱"><RotateCcw /></Button>}
      </div>
    </div>
  );
}
