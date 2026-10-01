'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  CircleHelp,
  Focus,
  Link2,
  LoaderCircle,
  Maximize2,
  Orbit,
  RotateCcw,
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
  paper: '#6ea8ff',
  method: '#c58cff',
  field: '#49dfc4',
  dataset: '#ffc76b',
};
const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
      char
    ] || char,
  );

export default function GraphCanvas({
  graph,
  selected,
  preferredScope,
  focus,
  connecting,
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
  onSelect: (id: string) => void;
  onEdge: (edge: GraphEdge) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: () => void;
  onReset: () => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const force = useRef<any>(null);
  const [ForceGraph, setForceGraph] = useState<ComponentType<any> | null>(null);
  const [SpriteText, setSpriteText] = useState<any>(null);
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
    Promise.all([import('react-force-graph-3d'), import('three-spritetext')])
      .then(([graphModule, textModule]) => {
        if (!active) return;
        setForceGraph(() => graphModule.default);
        setSpriteText(() => textModule.default);
      })
      .catch(() => {
        if (!active) return;
        setForceGraph(null);
        setLoadError('3D 星图资源加载失败，请检查网络后重试。');
      });
    return () => {
      active = false;
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
    const nodes: StarNode[] = visible.graph.nodes.map((node, index) => ({
      ...node,
      x: node.id === focus ? 0 : node.x == null ? undefined : (node.x - 500) / 9,
      y: node.id === focus ? 0 : node.y == null ? undefined : (node.y - 370) / 9,
      z: node.id === focus ? 0 : ((index * 17) % 11 - 5) * 2.4,
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
    const distance = 92;
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

  function nodeId(value: string | StarNode) {
    return typeof value === 'string' ? value : value.id;
  }
  function linkActive(link: StarLink) {
    const source = nodeId(link.source),
      target = nodeId(link.target);
    return source === selected || target === selected || link.id === hovered;
  }
  function nodeObject(node: StarNode) {
    if (!SpriteText) return undefined;
    const text = new SpriteText(node.label);
    text.color = node.id === selected ? '#ffffff' : '#dce9ff';
    text.textHeight = node.id === selected ? 5.2 : 3.5;
    text.backgroundColor = 'rgba(4, 11, 28, .72)';
    text.padding = 1.5;
    text.borderRadius = 2;
    text.position.y = node.id === selected ? -12 : -9;
    text.material.depthWrite = false;
    return text;
  }
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
          {Object.entries(scopeLabels).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={scope === key}
              onClick={() => setScope(key as RelationScope)}
            >
              {label}
            </button>
          ))}
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
              <i style={{ background: colors[key as NodeKind] }} />
              {label}
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
        {ForceGraph ? (
          <ForceGraph
            ref={force}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="#050b18"
            controlType="orbit"
            showNavInfo={false}
            nodeColor={(node: StarNode) =>
              node.id === selected ? '#ffffff' : colors[node.kind]
            }
            nodeRelSize={2.8}
            nodeVal={(node: StarNode) =>
              node.id === selected ? 10 : node.kind === 'paper' ? 7 : 4
            }
            nodeOpacity={0.96}
            nodeResolution={20}
            nodeLabel={(node: StarNode) =>
              `<b>${escape(node.label)}</b><br>${escape(kindNames[node.kind])}${node.year ? ` · ${node.year}` : ''}`
            }
            nodeThreeObject={nodeObject}
            nodeThreeObjectExtend
            linkColor={(link: StarLink) =>
              linkActive(link)
                ? '#8eb8ff'
                : link.status === 'candidate'
                  ? '#725c98'
                  : link.status === 'manual'
                    ? '#4f9e91'
                    : '#30496f'
            }
            linkWidth={(link: StarLink) => (linkActive(link) ? 1.8 : 0.7)}
            linkOpacity={0.78}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={0.92}
            linkDirectionalParticles={(link: StarLink) =>
              linkActive(link) ? 2 : 0
            }
            linkDirectionalParticleWidth={1.8}
            linkDirectionalParticleSpeed={0.004}
            linkLabel={(link: StarLink) =>
              `<b>${escape(link.type)}</b>${link.description ? `<br>${escape(link.description.slice(0, 120))}` : ''}`
            }
            warmupTicks={120}
            cooldownTicks={110}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.22}
            onEngineStop={() =>
              force.current?.zoomToFit?.(650, fitPadding)
            }
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
            <strong>三步理清论文关系</strong>
            <p>1 点星点选中心 · 2 在右侧用 AI 扩展 · 3 点连线核对关系</p>
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
        <span>{hovered ? '已高亮相邻关系' : '拖动空白处旋转视角'}</span>
      </div>
      <div className="star-tools">
        <Button variant={connecting ? 'secondary' : 'ghost'} size="icon" onClick={onConnect} title="手动连线" aria-label="手动连线"><Link2 /></Button>
        <Button variant="ghost" size="icon" onClick={fit} title="适应全部节点" aria-label="适应全部节点"><Focus /></Button>
        <Button variant={orbiting ? 'secondary' : 'ghost'} size="icon" onClick={() => setOrbiting((old) => !old)} title="自动巡航" aria-label="自动巡航"><Orbit /></Button>
        <Button variant="ghost" size="icon" onClick={() => void fullScreen()} title="全屏星图" aria-label="全屏星图"><Maximize2 /></Button>
        {focus && <Button variant="ghost" size="icon" onClick={onReset} title="查看完整图谱" aria-label="查看完整图谱"><RotateCcw /></Button>}
      </div>
    </div>
  );
}
