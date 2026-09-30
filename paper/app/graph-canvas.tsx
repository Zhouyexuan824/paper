'use client';
import { useRef, useState, useMemo, useEffect } from 'react';
import { Plus, Minus, Focus, Link2 } from 'lucide-react';
import {
  graphView,
  scopeLabels,
  relationCurve,
  type RelationScope,
} from '@/lib/graph-view';
import { CENTER, centeredNodes } from '@/lib/layout';
import { Button } from '@/components/ui/button';
import {
  kindNames,
  type Graph,
  type PaperNode,
  type GraphEdge,
  type NodeKind,
} from '@/lib/model';
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
  onEdge: (e: GraphEdge) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: () => void;
  onReset: () => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [scope, setScope] = useState<RelationScope>('insight');
  const [confirmed, setConfirmed] = useState(false);
  const [limit, setLimit] = useState(24);
  const researchStamp = graph.nodes.find((n) => n.id === focus)?.research
    ?.generatedAt;
  useEffect(() => {
    setLimit(24);
    setScope(focus ? preferredScope : 'all');
  }, [focus, researchStamp, preferredScope]);
  const [hidden, setHidden] = useState<NodeKind[]>([]);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const drag = useRef<{
    id?: string;
    x: number;
    y: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  const visible = useMemo(
    () => graphView(graph, focus, { scope, confirmed, hidden, limit }),
    [graph, focus, scope, confirmed, hidden, limit],
  );
  const nodes = useMemo(() => {
    const base = focus
      ? centeredNodes(visible.graph, focus)
      : visible.graph.nodes;
    return base.map((n, i) => {
      const override = positions[`${focus || 'all'}|${n.id}`];
      return {
        ...n,
        x:
          n.id === focus
            ? CENTER.x
            : (override?.x ?? n.x ?? 150 + (i % 6) * 160),
        y:
          n.id === focus
            ? CENTER.y
            : (override?.y ?? n.y ?? 150 + Math.floor(i / 6) * 160),
      };
    });
  }, [visible, focus, positions]);
  const points = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  function point(e: { clientX: number; clientY: number }) {
    const p = new DOMPoint(e.clientX, e.clientY);
    const m = svg.current?.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : p;
  }
  function fit() {
    if (!nodes.length) return;
    if (focus) {
      const rx = Math.max(
          250,
          ...nodes.map((n) => Math.abs(n.x - CENTER.x) + 95),
        ),
        ry = Math.max(220, ...nodes.map((n) => Math.abs(n.y - CENTER.y) + 100));
      const z = Math.min(1.15, 900 / (rx * 2), 610 / (ry * 2));
      setView({ x: 500 - CENTER.x * z, y: 370 - CENTER.y * z, z });
      return;
    }
    const xs = nodes.map((n) => n.x),
      ys = nodes.map((n) => n.y);
    const left = Math.min(...xs) - 100,
      right = Math.max(...xs) + 100,
      top = Math.min(...ys) - 100,
      bottom = Math.max(...ys) + 120;
    const z = Math.min(1.4, 900 / (right - left), 610 / (bottom - top));
    setView({
      x: 500 - ((left + right) / 2) * z,
      y: 380 - ((top + bottom) / 2) * z,
      z,
    });
  }
  useEffect(() => {
    fit();
  }, [
    focus,
    visible.graph.nodes.length,
    visible.graph.edges.length,
    hidden,
    scope,
    confirmed,
  ]);
  function down(e: React.PointerEvent, id?: string) {
    if (e.button !== 0) return;
    const p = point(e);
    const n = id ? points.get(id) : null;
    drag.current = {
      id,
      x: p.x,
      y: p.y,
      sx: n?.x ?? view.x,
      sy: n?.y ?? view.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = point(e),
      dx = p.x - d.x,
      dy = p.y - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.id && d.id !== focus)
      setPositions((old) => ({
        ...old,
        [`${focus || 'all'}|${d.id}`]: {
          x: d.sx + dx / view.z,
          y: d.sy + dy / view.z,
        },
      }));
    else if (!d.id) setView((old) => ({ ...old, x: d.sx + dx, y: d.sy + dy }));
  }
  function up(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.id) {
      if (d.moved) {
        const p = point(e);
        if (!focus)
          onMove(
            d.id,
            d.sx + (p.x - d.x) / view.z,
            d.sy + (p.y - d.y) / view.z,
          );
      } else onSelect(d.id);
    }
    e.stopPropagation();
  }
  function zoom(f: number) {
    setView((v) => {
      const z = Math.max(0.2, Math.min(2.5, v.z * f));
      return {
        x: 500 - ((500 - v.x) * z) / v.z,
        y: 370 - ((370 - v.y) * z) / v.z,
        z,
      };
    });
  }
  return (
    <div
      className={
        'graph-stage ' +
        (connecting ? 'connecting ' : '') +
        (view.z < 0.65 ? ' compact-labels' : '')
      }
    >
      <div className="relation-toolbar" aria-label="关系筛选">
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
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          隐藏待核验
        </label>
        <div className="graph-filters">
          {Object.entries(kindNames).map(([k, v]) => (
            <button
              key={k}
              className={hidden.includes(k as NodeKind) ? 'dim' : ''}
              onClick={() =>
                setHidden((old) =>
                  old.includes(k as NodeKind)
                    ? old.filter((x) => x !== k)
                    : [...old, k as NodeKind],
                )
              }
              aria-pressed={!hidden.includes(k as NodeKind)}
            >
              <i className={'dot ' + k} />
              {v}
            </button>
          ))}
        </div>
      </div>
      {connecting && (
        <div className="connect-banner">已选起点，点击另一个节点建立关系</div>
      )}
      <svg
        ref={svg}
        viewBox="0 0 1000 740"
        aria-label="可拖动和缩放的论文关系图"
        onPointerDown={(e) => down(e)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(e) => zoom(e.deltaY > 0 ? 0.92 : 1.08)}
      >
        <defs>
          <pattern
            id="dots"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" fill="#cbd5e1" opacity=".5" />
          </pattern>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9daec8" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
        <g transform={`translate(${view.x},${view.y}) scale(${view.z})`}>
          {visible.graph.edges.map((e) => {
            const a = points.get(e.source),
              b = points.get(e.target);
            if (!a || !b) return null;
            const curve = relationCurve(e, visible.graph.edges, a, b);
            return (
              <g
                key={e.id}
                role="button"
                tabIndex={0}
                aria-label={`${a.label} ${e.type} ${b.label}`}
                className={
                  'edge ' +
                  e.status +
                  (e.type === '引用' ? ' citation-edge' : '')
                }
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={() => onEdge(e)}
                onKeyDown={(ev) => ev.key === 'Enter' && onEdge(e)}
              >
                <path
                  d={curve.path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                />
                <path
                  d={curve.path}
                  fill="none"
                  className="graph-line"
                  markerEnd="url(#arrow)"
                />
                <text x={curve.x} y={curve.y - 8} className="edge-label">
                  {e.type}
                </text>
              </g>
            );
          })}
          {nodes.map((n) => {
            const big = n.id === (focus || selected);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                className={
                  'graph-node ' +
                  n.kind +
                  (big ? ' chosen' : '') +
                  (n.id === focus ? ' center-node' : '')
                }
                onPointerDown={(e) => down(e, n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(n.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={n.label}
              >
                <title>{n.title}</title>
                {n.id === focus && <circle r="64" className="center-ring" />}
                <circle r={big ? 53 : 40} className="node-halo" />
                <circle r={big ? 40 : 29} className="node-circle" />
                <text y="5" className="node-symbol">
                  {n.kind === 'paper'
                    ? '◈'
                    : n.kind === 'dataset'
                      ? '▦'
                      : n.kind === 'field'
                        ? '◎'
                        : '◇'}
                </text>
                <text y={big ? 72 : 60} className="node-label">
                  {n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}
                </text>
                {n.year && (
                  <text y={big ? 91 : 79} className="node-year">
                    {n.year}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {visible.omitted > 0 && (
        <button
          className="show-more-nodes"
          onClick={() => setLimit((v) => v + 24)}
        >
          还有 {visible.omitted} 个关联节点 · 再显示 24 个
        </button>
      )}
      {nodes.length <= (focus ? 1 : 0) && (
        <div className="graph-empty">
          <strong>
            {scope !== 'all' || confirmed || hidden.length
              ? '当前筛选下没有关系'
              : '从这篇论文开始探索'}
          </strong>
          <span>
            {scope !== 'all' || confirmed || hidden.length
              ? '试试其他关系类型，或恢复全部显示。'
              : '点击右侧 AI 扩展，或手动连接已有节点。'}
          </span>
          {(scope !== 'all' || confirmed || hidden.length > 0) && (
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
      <div className="canvas-note">
        <span className="live-dot" />
        {focus
          ? `${nodes.length} 个节点 · ${visible.graph.edges.length} 条直接关系`
          : '个人知识网络'}
        <span>· 拖动节点 · 滚轮缩放 · 点击连线编辑</span>
      </div>
      <div className="zoom-tools">
        <Button
          variant={connecting ? 'secondary' : 'ghost'}
          size="icon"
          title="手动连线"
          aria-label="手动连线"
          onClick={onConnect}
        >
          <Link2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="适应画布"
          aria-label="适应画布"
          onClick={fit}
        >
          <Focus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="放大"
          onClick={() => zoom(1.2)}
        >
          <Plus />
        </Button>
        <span>{Math.round(view.z * 100)}%</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="缩小"
          onClick={() => zoom(0.8)}
        >
          <Minus />
        </Button>
      </div>
      {focus && (
        <button className="back-to-all" onClick={onReset}>
          返回完整图谱
        </button>
      )}
    </div>
  );
}
