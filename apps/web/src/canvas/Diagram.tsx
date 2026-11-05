import '@xyflow/react/dist/style.css';
import Box from '@cloudscape-design/components/box';
import type { Hop, Status, Topology } from '@sim/engine';
import { Background, Controls, ReactFlow, type Edge } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import { useStatus } from '../console/data';
import { useT, type Translator } from '../i18n/useT';
import { useTopology, useTopologyStore } from '../state/topologyStore';
import { useTrace } from '../state/traceStore';
import { useUi, type CanvasLayout } from '../state/uiStore';
import { INTERNET_CLIENT_IP } from '../workbench/constants';
import './canvas.css';
import { ICONS } from './icons';
import { INTERNET_NODE_ID, hopNodeId, layoutTopology, nodeCenters } from './layout';
import { NODE_TYPES, type DiagramNode, type DiagramNodeData } from './nodes';
import { Packet } from './Packet';

const EMPTY_LAYOUT: CanvasLayout = {};

function nodeData(
  id: string,
  kind: DiagramNodeData['kind'],
  topology: Topology,
  status: Status,
  { t }: Translator,
): Omit<DiagramNodeData, 'failedText'> {
  switch (kind) {
    case 'internet':
      return {
        kind,
        icon: ICONS.client,
        title: t('diagram.internet'),
        lines: [INTERNET_CLIENT_IP],
      };
    case 'igw': {
      const igw = topology.internetGateways.find((gateway) => gateway.id === id);
      return {
        kind,
        icon: ICONS.internetGateway,
        title: igw?.name ?? id,
        lines: [id, ...(igw?.attachedVpcId === undefined ? [t('diagram.detached')] : [])],
      };
    }
    case 'vpc': {
      const vpc = topology.vpcs.find((candidate) => candidate.id === id);
      return {
        kind,
        icon: ICONS.vpc,
        title: vpc?.name ?? id,
        lines: [`${id} · ${vpc?.cidrBlock ?? ''}`],
      };
    }
    case 'subnet': {
      const subnet = topology.subnets.find((candidate) => candidate.id === id);
      const isPublic = status.subnets[id]?.type === 'public';
      return {
        kind,
        icon: isPublic ? ICONS.publicSubnet : ICONS.privateSubnet,
        title: subnet?.name ?? id,
        lines: [
          `${id} · ${subnet?.cidrBlock ?? ''}`,
          isPublic ? t('diagram.publicSubnet') : t('diagram.privateSubnet'),
        ],
      };
    }
    case 'instance': {
      const instance = topology.instances.find((candidate) => candidate.id === id);
      const eni = instance?.primaryNetworkInterface;
      return {
        kind,
        icon: ICONS.ec2Instance,
        title: instance?.name ?? id,
        lines: [
          eni?.privateIpAddress ?? '',
          ...(eni?.publicIp === undefined ? [] : [eni.publicIp.address]),
        ],
      };
    }
  }
}

/**
 * The topology diagram (React Flow). Nodes and edges change only when the topology, the
 * layout or the trace result changes; the packet moves on its own (see `Packet`).
 * AWS Architecture Icons appear here only (catalog skill, branding limits).
 */
export function Diagram() {
  const translator = useT();
  const { t } = translator;
  const topology = useTopology();
  const status = useStatus();
  const workspaceId = useTopologyStore((state) => state.activeWorkspaceId);
  const layout = useUi((state) => state.canvasLayouts[workspaceId]) ?? EMPTY_LAYOUT;
  const moveCanvasNode = useUi((state) => state.moveCanvasNode);
  const query = useTrace((state) => state.query);
  const result = useTrace((state) => state.result);

  const specs = useMemo(() => layoutTopology(topology, layout), [topology, layout]);
  const centers = useMemo(() => nodeCenters(specs), [specs]);
  const hops: readonly Hop[] = result?.status === 'evaluated' ? result.hops : [];

  const failedNodeId = useMemo(() => {
    if (result?.status !== 'evaluated' || result.failure === undefined || query === null)
      return null;
    const hop = result.hops[result.failure.hopIndex];
    return hop === undefined ? null : hopNodeId(hop, query, topology, status);
  }, [result, query, topology, status]);

  const nodes = useMemo<DiagramNode[]>(
    () =>
      specs.map((spec) => ({
        id: spec.id,
        type: 'resource',
        position: spec.position,
        ...(spec.parentId === undefined
          ? {}
          : { parentId: spec.parentId, extent: 'parent' as const }),
        style: { width: spec.width, height: spec.height },
        draggable: true,
        selectable: false,
        zIndex: spec.kind === 'vpc' ? 0 : spec.kind === 'subnet' ? 1 : 2,
        data: {
          ...nodeData(spec.id, spec.kind, topology, status, translator),
          ...(spec.id === failedNodeId ? { failedText: t('diagram.stoppedHere') } : {}),
        },
      })),
    [specs, topology, status, translator, failedNodeId, t],
  );

  const edges = useMemo<Edge[]>(
    () =>
      topology.internetGateways
        .filter((igw) => igw.attachedVpcId !== undefined)
        .flatMap((igw) => [
          { id: `${INTERNET_NODE_ID}-${igw.id}`, source: INTERNET_NODE_ID, target: igw.id },
          {
            id: `${igw.id}-${igw.attachedVpcId ?? ''}`,
            source: igw.id,
            target: igw.attachedVpcId ?? '',
          },
        ]),
    [topology],
  );

  const positionOf = useCallback(
    (hop: Hop) =>
      query === null ? undefined : centers.get(hopNodeId(hop, query, topology, status)),
    [centers, query, topology, status],
  );

  if (topology.vpcs.length === 0 && topology.internetGateways.length === 0) {
    return (
      <Box textAlign="center" color="text-body-secondary" padding="l">
        {t('diagram.empty')}
      </Box>
    );
  }

  return (
    <div className="sim-diagram" role="region" aria-label={t('diagram.label')}>
      <ReactFlow<DiagramNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        nodesConnectable={false}
        elementsSelectable={false}
        onNodeDragStop={(_event, node) => {
          moveCanvasNode(workspaceId, node.id, node.position.x, node.position.y);
        }}
        minZoom={0.3}
      >
        <Background />
        <Controls showInteractive={false} />
        <Packet hops={hops} positionOf={positionOf} />
      </ReactFlow>
    </div>
  );
}
