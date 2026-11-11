import { indexById } from '../internal/lookup';
import type {
  Instance,
  InternetGateway,
  NatGateway,
  NetworkAcl,
  RouteTable,
  SecurityGroup,
  Subnet,
  Topology,
  Vpc,
} from '../schema';

/**
 * A parsed topology with its resources indexed by ID. Built once per `validate()`,
 * `trace()` or `deriveStatus()` call; it never changes the topology.
 */
export interface Model {
  readonly topology: Topology;
  readonly vpcs: ReadonlyMap<string, Vpc>;
  readonly subnets: ReadonlyMap<string, Subnet>;
  readonly routeTables: ReadonlyMap<string, RouteTable>;
  readonly internetGateways: ReadonlyMap<string, InternetGateway>;
  /** Empty when the topology has no `natGateways` key. */
  readonly natGateways: ReadonlyMap<string, NatGateway>;
  readonly securityGroups: ReadonlyMap<string, SecurityGroup>;
  readonly networkAcls: ReadonlyMap<string, NetworkAcl>;
  readonly instances: ReadonlyMap<string, Instance>;
}

/** The topology's NAT gateways; the key is optional (docs/specs/r1-nat-gateway.md section 2). */
export function natGatewaysOf(topology: Topology): readonly NatGateway[] {
  return topology.natGateways ?? [];
}

export function buildModel(topology: Topology): Model {
  return {
    topology,
    vpcs: indexById(topology.vpcs),
    subnets: indexById(topology.subnets),
    routeTables: indexById(topology.routeTables),
    internetGateways: indexById(topology.internetGateways),
    natGateways: indexById(natGatewaysOf(topology)),
    securityGroups: indexById(topology.securityGroups),
    networkAcls: indexById(topology.networkAcls),
    instances: indexById(topology.instances),
  };
}

export { networkAclOf, routeTableOf } from './associations';
export { attachedInternetGateway } from './internet-gateway';
export { CLIENT_PORT_RANGES, type ClientType, type PortRange } from './ports';
export { effectiveRoutes, lookupRoute, type EffectiveRoute, type RouteLookup } from './routes';
