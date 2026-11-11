import type { Hop, Status, Topology, TraceQuery } from '@sim/engine';
import type { CanvasLayout } from '../state/uiStore';

/**
 * Deterministic diagram layout: the internet client on the left, each VPC's internet
 * gateway next to it, then the VPC with its subnets stacked and their instances in a row.
 * Positions of child nodes are relative to their parent group, as React Flow expects.
 * Positions the learner moved (UI store, AGENTS.md rule 5) replace the computed ones.
 */

export type CanvasNodeKind = 'internet' | 'igw' | 'vpc' | 'subnet' | 'instance';

export interface CanvasNodeSpec {
  readonly id: string;
  readonly kind: CanvasNodeKind;
  readonly parentId?: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
}

export const INTERNET_NODE_ID = 'internet';

const LEAF = { width: 160, height: 96 };
const GAP = 24;
const GROUP_HEADER = 48;
const INSTANCE_STEP = LEAF.width + GAP;
const VPC_X = 360;
const IGW_X = 190;

function subnetSize(instanceCount: number) {
  return {
    width: Math.max(380, GAP + Math.max(1, instanceCount) * INSTANCE_STEP),
    height: GROUP_HEADER + LEAF.height + GAP,
  };
}

export function layoutTopology(topology: Topology, overrides: CanvasLayout = {}): CanvasNodeSpec[] {
  const nodes: CanvasNodeSpec[] = [];
  const at = (id: string, position: { x: number; y: number }) => overrides[id] ?? position;
  let y = 0;
  const attached = new Set<string>();

  for (const vpc of topology.vpcs) {
    const subnets = topology.subnets.filter((subnet) => subnet.vpcId === vpc.id);
    const sizes = subnets.map((subnet) =>
      subnetSize(
        topology.instances.filter((i) => i.primaryNetworkInterface.subnetId === subnet.id).length,
      ),
    );
    const width = Math.max(440, ...sizes.map((size) => size.width + 2 * GAP));
    const height = Math.max(
      200,
      GROUP_HEADER + sizes.reduce((sum, size) => sum + size.height + GAP, 0) + GAP,
    );
    nodes.push({ id: vpc.id, kind: 'vpc', position: at(vpc.id, { x: VPC_X, y }), width, height });

    let subnetY = GROUP_HEADER;
    subnets.forEach((subnet, index) => {
      const size = sizes[index] ?? subnetSize(0);
      nodes.push({
        id: subnet.id,
        kind: 'subnet',
        parentId: vpc.id,
        position: at(subnet.id, { x: GAP, y: subnetY }),
        ...size,
      });
      topology.instances
        .filter((instance) => instance.primaryNetworkInterface.subnetId === subnet.id)
        .forEach((instance, i) => {
          nodes.push({
            id: instance.id,
            kind: 'instance',
            parentId: subnet.id,
            position: at(instance.id, { x: GAP + i * INSTANCE_STEP, y: GROUP_HEADER - 8 }),
            ...LEAF,
          });
        });
      subnetY += size.height + GAP;
    });

    const igw = topology.internetGateways.find((gateway) => gateway.attachedVpcId === vpc.id);
    if (igw !== undefined) {
      attached.add(igw.id);
      nodes.push({
        id: igw.id,
        kind: 'igw',
        position: at(igw.id, { x: IGW_X, y: y + height / 2 - LEAF.height / 2 }),
        width: 130,
        height: LEAF.height,
      });
    }
    y += height + 2 * GAP;
  }

  for (const igw of topology.internetGateways.filter((gateway) => !attached.has(gateway.id))) {
    nodes.push({
      id: igw.id,
      kind: 'igw',
      position: at(igw.id, { x: IGW_X, y }),
      width: 130,
      height: LEAF.height,
    });
    y += LEAF.height + GAP;
  }

  const firstVpc = nodes.find((node) => node.kind === 'vpc');
  nodes.unshift({
    id: INTERNET_NODE_ID,
    kind: 'internet',
    position: at(INTERNET_NODE_ID, {
      x: 0,
      y: firstVpc === undefined ? 0 : firstVpc.height / 2 - LEAF.height / 2,
    }),
    width: 150,
    height: LEAF.height,
  });
  return nodes;
}

/** Absolute center of every node: parent positions added up. */
export function nodeCenters(
  nodes: readonly CanvasNodeSpec[],
): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const origin = (node: CanvasNodeSpec): { x: number; y: number } => {
    const parent = node.parentId === undefined ? undefined : byId.get(node.parentId);
    const base = parent === undefined ? { x: 0, y: 0 } : origin(parent);
    return { x: base.x + node.position.x, y: base.y + node.position.y };
  };
  return new Map(
    nodes.map((node) => {
      const o = origin(node);
      return [node.id, { x: o.x + node.width / 2, y: o.y + node.height / 2 }];
    }),
  );
}

/**
 * The diagram node a hop happens at. Route lookups name a route table, which can serve
 * many subnets, so the lookup is drawn on the subnet of the instance that sends the packet
 * in that direction.
 */
export function hopNodeId(hop: Hop, query: TraceQuery, topology: Topology, status: Status): string {
  const { component } = hop;
  switch (component.type) {
    case 'internet-gateway':
    case 'vpc':
    case 'subnet':
    case 'instance':
      return component.id;
    case 'network-interface':
      return (
        topology.instances.find((instance) => instance.primaryNetworkInterface.id === component.id)
          ?.id ?? component.id
      );
    case 'nat-gateway':
      // No NAT gateway node yet: the hop is drawn on its subnet (r1-nat-gateway.md 1).
      return topology.natGateways?.find((nat) => nat.id === component.id)?.subnetId ?? component.id;
    case 'route-table': {
      const sender =
        hop.direction === 'forward'
          ? query.source.type === 'instance'
            ? query.source.instanceId
            : undefined
          : query.destination.type === 'instance'
            ? query.destination.instanceId
            : query.source.type === 'instance'
              ? query.source.instanceId
              : undefined;
      const instance = topology.instances.find((candidate) => candidate.id === sender);
      const subnetId = instance?.primaryNetworkInterface.subnetId;
      // F3 also looks up the NAT gateway's subnet table, which the instance doesn't use.
      const usesTable =
        subnetId !== undefined && status.subnets[subnetId]?.routeTableId === component.id;
      return (
        (usesTable ? subnetId : undefined) ??
        status.routeTables[component.id]?.subnetIds[0] ??
        subnetId ??
        INTERNET_NODE_ID
      );
    }
  }
}
