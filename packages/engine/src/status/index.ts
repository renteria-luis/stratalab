import { mustParseCidr, usableAddressCount } from '../cidr';
import {
  attachedInternetGateway,
  buildModel,
  CLIENT_PORT_RANGES,
  effectiveRoutes,
  networkAclOf,
  routeTableOf,
  type PortRange,
} from '../model';
import type { Topology } from '../schema';

export interface VpcStatus {
  readonly internetGatewayId: string | null;
}

export interface SubnetStatus {
  readonly type: 'public' | 'private';
  readonly routeTableId: string;
  readonly routeTableAssociation: 'explicit' | 'main';
  readonly networkAclId: string;
  readonly networkAclAssociation: 'explicit' | 'default';
  readonly availableIpv4Count: number;
}

export interface RouteStatus {
  readonly destinationCidrBlock: string;
  /** `local` or an internet gateway ID. */
  readonly target: string;
  readonly state: 'active' | 'blackhole';
  readonly origin: 'CreateRouteTable' | 'CreateRoute';
}

export interface RouteTableStatus {
  readonly main: boolean;
  readonly subnetIds: readonly string[];
  readonly routes: readonly RouteStatus[];
}

export interface InternetGatewayStatus {
  readonly state: 'attached' | 'detached';
}

export interface InstanceStatus {
  readonly publicIpv4Address: string | null;
  readonly clientPortRange: PortRange;
}

/** Derived facts, keyed by resource ID. Keys follow topology array order. */
export interface Status {
  readonly vpcs: Readonly<Record<string, VpcStatus>>;
  readonly subnets: Readonly<Record<string, SubnetStatus>>;
  readonly routeTables: Readonly<Record<string, RouteTableStatus>>;
  readonly internetGateways: Readonly<Record<string, InternetGatewayStatus>>;
  readonly instances: Readonly<Record<string, InstanceStatus>>;
}

/**
 * Facts the console shows that AWS derives instead of storing (docs/specs/r0-engine.md
 * section 6). Pure and deterministic; works on topologies with `validate()` errors too.
 *
 * Rules:
 * - RT-01 main table and associations: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html
 * - RT-03 local route: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html
 * - RT-08 blackhole state: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_Route.html
 * - RT-09 public subnet (an active route to an internet gateway; blackhole-only is private,
 *   Inferred, Q8): https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html
 * - NACL-01 default network ACL: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
 * - IGW-05 attachment: https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
 * - ADR-04 five reserved addresses per subnet: https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
 * - ADR-10 public IPv4 address: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html
 * - EPH-01 client port range by platform: https://docs.aws.amazon.com/vpc/latest/userguide/custom-network-acl.html
 */
export function deriveStatus(topology: Topology): Status {
  const model = buildModel(topology);
  const routesByTable = new Map(
    topology.routeTables.map((table) => [table.id, effectiveRoutes(model, table)]),
  );
  const subnetTables = new Map(
    topology.subnets.map((subnet) => [subnet.id, routeTableOf(model, subnet)]),
  );

  const vpcs: Record<string, VpcStatus> = {};
  for (const vpc of topology.vpcs) {
    vpcs[vpc.id] = { internetGatewayId: attachedInternetGateway(topology, vpc.id)?.id ?? null };
  }

  const subnets: Record<string, SubnetStatus> = {};
  for (const subnet of topology.subnets) {
    const { table, association } = routeTableOf(model, subnet);
    const { acl, association: aclAssociation } = networkAclOf(model, subnet);
    const routes = routesByTable.get(table.id) ?? [];
    const isPublic = routes.some((route) => route.target !== 'local' && route.state === 'active');
    const interfaces = topology.instances.filter(
      (instance) => instance.primaryNetworkInterface.subnetId === subnet.id,
    ).length;
    subnets[subnet.id] = {
      type: isPublic ? 'public' : 'private',
      routeTableId: table.id,
      routeTableAssociation: association,
      networkAclId: acl.id,
      networkAclAssociation: aclAssociation,
      availableIpv4Count: Math.max(
        0,
        usableAddressCount(mustParseCidr(subnet.cidrBlock).prefix) - interfaces,
      ),
    };
  }

  const routeTables: Record<string, RouteTableStatus> = {};
  for (const table of topology.routeTables) {
    const vpc = model.vpcs.get(table.vpcId);
    routeTables[table.id] = {
      main: vpc?.mainRouteTableId === table.id,
      subnetIds: topology.subnets
        .filter((subnet) => subnetTables.get(subnet.id)?.table.id === table.id)
        .map((subnet) => subnet.id),
      routes: (routesByTable.get(table.id) ?? []).map((route) => ({
        destinationCidrBlock: route.destinationCidrBlock,
        target: route.target,
        state: route.state,
        origin: route.origin,
      })),
    };
  }

  const internetGateways: Record<string, InternetGatewayStatus> = {};
  for (const igw of topology.internetGateways) {
    internetGateways[igw.id] = { state: igw.attachedVpcId === undefined ? 'detached' : 'attached' };
  }

  const instances: Record<string, InstanceStatus> = {};
  for (const instance of topology.instances) {
    instances[instance.id] = {
      publicIpv4Address: instance.primaryNetworkInterface.publicIp?.address ?? null,
      clientPortRange: { ...CLIENT_PORT_RANGES[instance.platform] },
    };
  }

  return { vpcs, subnets, routeTables, internetGateways, instances };
}
