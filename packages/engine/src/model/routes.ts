import { contains, mustParseCidr, type CidrBlock, type Ipv4Address } from '../cidr';
import { mustGet } from '../internal/lookup';
import type { RouteTable } from '../schema';
import type { Model } from './index';

/** A route as the console shows it: the derived local route first, then the stored routes. */
export interface EffectiveRoute {
  readonly destinationCidrBlock: string;
  readonly block: CidrBlock;
  /** `local` or an internet gateway ID. */
  readonly target: string;
  readonly state: 'active' | 'blackhole';
  readonly origin: 'CreateRouteTable' | 'CreateRoute';
}

/**
 * The routes of a table with their state. The local route (VPC CIDR → local) is derived and
 * always active. A route to an internet gateway that isn't attached to the table's VPC is
 * `blackhole`.
 *
 * Rules:
 * - RT-03 local route: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html
 * - RT-08 blackhole state: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_Route.html
 */
export function effectiveRoutes(model: Model, table: RouteTable): EffectiveRoute[] {
  const vpc = mustGet(model.vpcs, table.vpcId);
  const local: EffectiveRoute = {
    destinationCidrBlock: vpc.cidrBlock,
    block: mustParseCidr(vpc.cidrBlock),
    target: 'local',
    state: 'active',
    origin: 'CreateRouteTable',
  };
  const stored = table.routes.map((route): EffectiveRoute => {
    const igw = mustGet(model.internetGateways, route.target.internetGatewayId);
    return {
      destinationCidrBlock: route.destinationCidrBlock,
      block: mustParseCidr(route.destinationCidrBlock),
      target: igw.id,
      state: igw.attachedVpcId === table.vpcId ? 'active' : 'blackhole',
      origin: 'CreateRoute',
    };
  });
  return [local, ...stored];
}

export interface RouteLookup {
  /** The most specific route that contains the address, or null when none does. */
  readonly route: EffectiveRoute | null;
  /**
   * True when the chosen route is `blackhole` and a less specific `active` route also
   * matches. Dropping the packet instead of falling back is Inferred (Q8).
   */
  readonly shadowsActiveRoute: boolean;
}

/**
 * Longest prefix match. R0 tables have only the local route and static routes with unique
 * destinations (RT-11) that never overlap the local route (RT-03), so there are no ties;
 * on a tie the first route in table order would win (RT-10, stable order).
 * A blackhole route still takes part in the match (RT-08, Inferred, Q8).
 *
 * Rules:
 * - RT-04 longest prefix match: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html
 * - RT-08 blackhole routes: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export function lookupRoute(routes: readonly EffectiveRoute[], address: Ipv4Address): RouteLookup {
  const matching = routes.filter((route) => contains(route.block, address));
  let best: EffectiveRoute | null = null;
  for (const route of matching) {
    if (best === null || route.block.prefix > best.block.prefix) best = route;
  }
  const shadowsActiveRoute =
    best?.state === 'blackhole' && matching.some((route) => route.state === 'active');
  return { route: best, shadowsActiveRoute };
}
