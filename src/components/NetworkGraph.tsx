import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getStraightPath,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Maximize, Minus, Network, Plus, RotateCcw, Router } from 'lucide-react';
import type { Device, Snapshot } from '../types';
import { displayName } from '../types';
import { formatBand, humanize } from '../services/format';
import { networkLayout } from '../services/network-layout';
import { useUI } from '../stores/ui';
import { Empty } from './ui';
import { useGraphMotion } from './useGraphMotion';
import '@xyflow/react/dist/style.css';

type GraphNode = Node<
  { device?: Device; label: string; address: string; connection?: string; labelAbove?: boolean },
  'network'
>;
type FlowEdge = Edge<{ active: boolean; highlighted: boolean }, 'traffic'>;

function TrafficEdge(props: EdgeProps<FlowEdge>) {
  const [path] = getStraightPath(props);
  return (
    <>
      <BaseEdge id={props.id} path={path} style={props.style} />
      {props.data?.active && (
        <path
          d={path}
          className="traffic-flow"
          fill="none"
          strokeWidth="1.5"
          strokeDasharray="2 24"
          strokeLinecap="round"
        />
      )}
    </>
  );
}

function NetworkNode({ id, data, selected }: NodeProps<GraphNode>) {
  const select = useUI((state) => state.selectDevice);
  const d = data.device;
  const status = d?.status ?? data.connection ?? 'disconnected';
  const band =
    d?.connectionType !== 'wifi'
      ? 'neighbor'
      : d.wifiBand?.startsWith('5')
        ? 'band-5'
        : d.wifiBand?.startsWith('2.4')
          ? 'band-24'
          : 'band-other';
  return (
    <div
      className={`constellation-node ${d ? `client-dot ${band}` : 'router-dot'} state-${status} ${selected ? 'selected' : ''} ${data.labelAbove ? 'upper-label' : ''}`}
      title={`${data.label}\n${data.address}\n${humanize(status)}${d?.connectionType === 'wifi' ? ` · ${formatBand(d.wifiBand)}` : ''}`}
      role={d ? 'button' : undefined}
      tabIndex={d ? 0 : -1}
      aria-label={d ? `Выбрать устройство ${data.label}` : undefined}
      onKeyDown={(event) => {
        if (d && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          select(id);
        }
      }}
    >
      <Handle id={d ? 'client' : 'hub'} type={d ? 'target' : 'source'} position={Position.Top} />
      <span className="constellation-orb">{!d && <Router size={20} strokeWidth={1.5} />}</span>
      <strong>{data.label}</strong>
      {!d && <span className="constellation-detail">Маршрутизатор</span>}
      <span className="constellation-address">{data.address || 'Адрес не получен'}</span>
    </div>
  );
}
const nodeTypes = { network: NetworkNode };
const edgeTypes = { traffic: TrafficEdge };

function Graph({ snapshot, compact }: { snapshot: Snapshot; compact: boolean }) {
  const { fitView, zoomIn, zoomOut, getNodes } = useReactFlow<GraphNode, FlowEdge>();
  const wrapper = useRef<HTMLDivElement>(null);
  const initialized = useNodesInitialized();
  const [hoveredId, setHovered] = useState<string | null>(null);
  const select = useUI((s) => s.selectDevice);
  const selectedId = useUI((s) => s.selectedId);
  const devices = useMemo(() => snapshot.devices.filter((d) => !d.hidden), [snapshot.devices]);
  const topologyKey = JSON.stringify(devices.map((d) => d.id).sort());
  const layout = useMemo(
    () => networkLayout(JSON.parse(topologyKey) as string[], compact),
    [topologyKey, compact],
  );
  const base: GraphNode[] = useMemo(
    () => [
      {
        id: 'router',
        type: 'network',
        position: layout.router,
        style: { width: layout.width, height: layout.height },
        initialWidth: layout.width,
        initialHeight: layout.height,
        data: {
          label: snapshot.router?.model || 'Маршрутизатор',
          address: snapshot.router?.address.replace(/^https?:\/\//, '') || '',
          connection: snapshot.connection,
        },
        ariaLabel: 'Маршрутизатор',
      },
      ...layout.devices.map((item): GraphNode => {
        const device = devices.find((d) => d.id === item.id)!;
        return {
          id: item.id,
          type: 'network',
          position: item.position,
          style: { width: layout.width, height: layout.height },
          initialWidth: layout.width,
          initialHeight: layout.height,
          data: {
            device,
            label: displayName(device),
            address: device.ipv4Addresses[0] || device.ipv6Addresses[0] || '',
          },
          ariaLabel: `${displayName(device)} · ${humanize(device.status)}`,
        };
      }),
    ],
    [devices, layout, snapshot.router, snapshot.connection],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(base);
  const motion = useGraphMotion(setNodes, getNodes, wrapper);
  const visibleNodes = useMemo(() => {
    const routerY = nodes.find((node) => node.id === 'router')?.position.y ?? 0;
    return nodes.map((node) => ({
      ...node,
      data: { ...node.data, labelAbove: !!node.data.device && node.position.y < routerY - 30 },
    }));
  }, [nodes]);
  useEffect(() => {
    setNodes((previous) =>
      base.map((node) => {
        const existing = previous.find((old) => old.id === node.id);
        return {
          ...existing,
          ...node,
          position: existing?.position ?? node.position,
          selected: node.id === selectedId,
        };
      }),
    );
  }, [base, selectedId, setNodes]);

  // Fit the actual available canvas, including inspector/banner changes. Polling
  // refreshes labels and status without resetting a user's zoom or dragged nodes.
  useEffect(() => {
    const element = wrapper.current;
    if (!initialized || !element) return;
    let frame = 0;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void fitView({ padding: 0.24, maxZoom: 1 }));
    });
    resize.observe(element);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [fitView, initialized, topologyKey]);

  const live = snapshot.connection === 'connected';
  const focusedId = hoveredId ?? (devices.some((d) => d.id === selectedId) ? selectedId : null);
  const edges: FlowEdge[] = devices.map((d) => {
    const highlighted = focusedId === d.id || focusedId === 'router';
    return {
      id: `edge-${d.id}`,
      type: 'traffic',
      source: 'router',
      target: d.id,
      sourceHandle: 'hub',
      targetHandle: 'client',
      ariaLabel: `Подключение: ${displayName(d)}`,
      data: {
        active:
          live &&
          d.status === 'online' &&
          highlighted &&
          ((d.txBps ?? 0) > 0 || (d.rxBps ?? 0) > 0),
        highlighted,
      },
      style: {
        stroke: highlighted ? 'var(--graph-focus)' : 'var(--graph-line)',
        strokeWidth: highlighted ? 1.6 : 1,
        strokeDasharray: d.connectionType === 'wifi' ? undefined : '4 6',
        opacity: focusedId && !highlighted ? 0.18 : 1,
      },
    };
  });
  return (
    <div
      ref={wrapper}
      className={`network-graph topology-graph constellation ${compact ? 'compact' : ''}`}
    >
      <div className="map-summary">
        <Network size={14} />
        <span>Граф сети</span>
        <b>{devices.length}</b>
      </div>
      <span className={`map-live-label ${live ? 'live' : ''}`}>
        <i />
        {live ? 'Обновляется' : 'Сохранённые данные'}
      </span>
      <div className="topology-canvas">
        <ReactFlow<GraphNode, FlowEdge>
          nodes={visibleNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={(_, node) => motion.dragStart(node)}
          onNodeDrag={(_, node) => motion.drag(node)}
          onNodeDragStop={(_, node) => motion.dragStop(node)}
          onNodeClick={(_, node) => {
            if (node.data.device) select(node.id);
          }}
          onNodeMouseEnter={(_, node) => setHovered(node.id)}
          onNodeMouseLeave={() => setHovered(null)}
          onPaneClick={() => select(null)}
          fitView
          fitViewOptions={{ padding: 0.24, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={1.8}
          nodesConnectable={false}
          nodesFocusable={false}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          defaultEdgeOptions={{ selectable: false, focusable: false }}
          ariaLabelConfig={{
            'node.a11yDescription.default': 'Нажмите Enter или пробел, чтобы выбрать устройство.',
            'node.a11yDescription.keyboardDisabled':
              'Нажмите Enter или пробел, чтобы выбрать устройство.',
            'edge.a11yDescription.default': 'Логическое подключение к маршрутизатору.',
          }}
          aria-label="Карта локальной сети"
        >
          <Background
            color="var(--map-grid)"
            gap={28}
            size={0.7}
            variant={BackgroundVariant.Dots}
          />
        </ReactFlow>
      </div>
      <div className="map-toolbar" role="group" aria-label="Управление картой">
        <button
          className="icon-button"
          title="Приблизить"
          aria-label="Приблизить"
          onClick={() => void zoomIn({ duration: 160 })}
        >
          <Plus size={15} />
        </button>
        <button
          className="icon-button"
          title="Отдалить"
          aria-label="Отдалить"
          onClick={() => void zoomOut({ duration: 160 })}
        >
          <Minus size={15} />
        </button>
        <span />
        <button
          className="icon-button"
          title="Показать всю сеть"
          aria-label="Показать всю сеть"
          onClick={() => void fitView({ padding: 0.24, maxZoom: 1, duration: 200 })}
        >
          <Maximize size={14} />
        </button>
        <button
          className="icon-button"
          title="Сбросить расположение"
          aria-label="Сбросить расположение"
          onClick={() => {
            motion.reset();
            setNodes((old) =>
              old.map((node) => ({
                ...node,
                position: base.find((item) => item.id === node.id)?.position ?? node.position,
              })),
            );
            requestAnimationFrame(() => void fitView({ padding: 0.24, maxZoom: 1, duration: 200 }));
          }}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="topology-note">Выберите узел, чтобы открыть устройство</div>
    </div>
  );
}

export function NetworkGraph({
  snapshot,
  compact = false,
}: {
  snapshot: Snapshot;
  compact?: boolean;
}) {
  if (!snapshot.devices.some((d) => !d.hidden))
    return (
      <Empty title="Пока нет устройств">
        Устройства появятся после подключения к маршрутизатору.
      </Empty>
    );
  return (
    <ReactFlowProvider>
      <Graph
        key={`${snapshot.mode}/${snapshot.router?.id}/${compact}`}
        snapshot={snapshot}
        compact={compact}
      />
    </ReactFlowProvider>
  );
}
