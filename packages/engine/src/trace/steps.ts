import { mustParseIpv4 } from '../cidr';
import { effectiveRoutes, lookupRoute, type Model } from '../model';
import type { Fidelity, RuleId } from '../rules';
import type { Instance, NetworkAcl, NetworkInterface, RouteTable, Subnet } from '../schema';
import { egressDestinationProblem, ingressSourceProblem } from './internet-gateway';
import { evaluateNacl } from './nacl';
import { evaluateSecurityGroups, type Remote } from './security-group';
import type {
  Direction,
  EvaluatedTrace,
  Hop,
  HopMatch,
  HopStep,
  Packet,
  ReasonCode,
  TraceClient,
  Verdict,
} from './types';

/** A hop before it gets its index and direction. */
export type HopDraft = Omit<Hop, 'index' | 'direction'>;

/** Evaluates one hop. Steps run in order and only until one fails (TRC-02). */
export type Step = () => HopDraft;

interface HopBase {
  readonly step: HopStep;
  readonly component: Hop['component'];
  readonly packet: Packet;
  readonly ruleIds: readonly RuleId[];
  readonly fidelity: Fidelity;
}

const FIDELITY_RANK: Readonly<Record<Fidelity, number>> = {
  Exact: 2,
  Inferred: 1,
  Unsupported: 0,
};

export function lowestFidelity(values: readonly Fidelity[]): Fidelity {
  return values.reduce<Fidelity>(
    (lowest, value) => (FIDELITY_RANK[value] < FIDELITY_RANK[lowest] ? value : lowest),
    'Exact',
  );
}

function passed(base: HopBase, extra: { match?: HopMatch; translatedTo?: Packet } = {}): HopDraft {
  const { step, component, packet, ruleIds, fidelity } = base;
  return {
    step,
    component,
    packet,
    ...(extra.translatedTo === undefined ? {} : { translatedTo: extra.translatedTo }),
    outcome: 'pass',
    ...(extra.match === undefined ? {} : { match: extra.match }),
    reasonCodes: [],
    ruleIds,
    fidelity,
  };
}

function failed(base: HopBase, reasonCode: ReasonCode, match?: HopMatch): HopDraft {
  const { step, component, packet, ruleIds, fidelity } = base;
  return {
    step,
    component,
    packet,
    outcome: 'fail',
    ...(match === undefined ? {} : { match }),
    reasonCodes: [reasonCode],
    ruleIds,
    fidelity,
  };
}

function skipped(base: HopBase, because: 'stateful-response' | 'same-subnet'): HopDraft {
  const { step, component, packet, ruleIds, fidelity } = base;
  return {
    step,
    component,
    packet,
    outcome: 'skipped',
    skippedBecause: because,
    reasonCodes: [],
    ruleIds,
    fidelity,
  };
}

/** NACL-02: the subnet's network ACL, checked against the remote address and `port`. */
export function naclStep(options: {
  step: 'nacl-inbound' | 'nacl-outbound';
  subnet: Subnet;
  acl: NetworkAcl;
  packet: Packet;
  remoteIp: string;
  port: number;
  ruleIds: readonly RuleId[];
}): HopDraft {
  const { step, subnet, acl, packet, remoteIp, port, ruleIds } = options;
  const base: HopBase = {
    step,
    component: { type: 'subnet', id: subnet.id },
    packet,
    ruleIds,
    fidelity: 'Exact',
  };
  const direction = step === 'nacl-inbound' ? 'inbound' : 'outbound';
  const decision = evaluateNacl(acl, direction, mustParseIpv4(remoteIp), port);
  return decision.allowed
    ? passed(base, { match: decision.match })
    : failed(base, 'SUBNET_ACL_RESTRICTION', decision.match);
}

/** NACL-04: traffic that stays inside one subnet never meets its network ACL. */
export function sameSubnetNaclStep(
  step: 'nacl-inbound' | 'nacl-outbound',
  subnet: Subnet,
  packet: Packet,
): HopDraft {
  const component = { type: 'subnet', id: subnet.id } as const;
  return skipped(
    { step, component, packet, ruleIds: ['NACL-04'], fidelity: 'Exact' },
    'same-subnet',
  );
}

/** SG-02 to SG-04: the interface's security groups for a new connection. */
export function sgStep(options: {
  step: 'sg-egress' | 'sg-ingress';
  model: Model;
  networkInterface: NetworkInterface;
  packet: Packet;
  remote: Remote;
  port: number;
  ruleIds: readonly RuleId[];
}): HopDraft {
  const { step, model, networkInterface, packet, remote, port, ruleIds } = options;
  const base: HopBase = {
    step,
    component: { type: 'network-interface', id: networkInterface.id },
    packet,
    ruleIds,
    fidelity: 'Exact',
  };
  const direction = step === 'sg-ingress' ? 'inbound' : 'outbound';
  const decision = evaluateSecurityGroups(model, networkInterface, direction, remote, port);
  if (decision.allowed) return passed(base, { match: decision.match });
  // Choosing SG_HAS_NO_RULES over ENI_SG_RULES_MISMATCH is our mapping (SG-02, Inferred).
  const fidelity = decision.reasonCode === 'SG_HAS_NO_RULES' ? 'Inferred' : base.fidelity;
  return failed({ ...base, fidelity }, decision.reasonCode);
}

/** SG-01: security groups are stateful, so responses of an allowed flow skip them. */
export function statefulSgStep(
  step: 'sg-egress' | 'sg-ingress',
  networkInterface: NetworkInterface,
  packet: Packet,
): HopDraft {
  const component = { type: 'network-interface', id: networkInterface.id } as const;
  return skipped(
    { step, component, packet, ruleIds: ['SG-01'], fidelity: 'Exact' },
    'stateful-response',
  );
}

/** Route targets a route step can follow. */
export type RouteTargetType = 'local' | 'internet-gateway' | 'nat-gateway';

/**
 * Route lookup in the subnet's route table: longest prefix match (RT-04). A matching
 * blackhole route fails the hop (RT-08): with `MORE_SPECIFIC_ROUTE` when it shadows a less
 * specific active route, as Reachability Analyzer reports it (golden `s4-q8-blackhole`, Q14;
 * Inferred, Q8), otherwise with `BAD_STATE_ROUTE`. A route to a NAT gateway where the flow
 * can't follow one (a reply, or the NAT gateway's own subnet) fails with
 * `UNSUPPORTED_FEATURE` (Q15, Q16). Returns the gateway the packet goes to, if any.
 *
 * Rules: RT-04, RT-05, RT-08 · https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html ·
 * https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export function routeStep(options: {
  model: Model;
  table: RouteTable;
  packet: Packet;
  destinationIp: string;
  expectedTarget: RouteTargetType;
  ruleIds: readonly RuleId[];
  fidelity: Fidelity;
  /** Added to `ruleIds` when a NAT gateway route is unsupported here (Q15: NAT-02, Q16: NAT-01). */
  unsupportedNatRuleId?: RuleId;
}): { hop: HopDraft; internetGatewayId: string | null; natGatewayId: string | null } {
  const { model, table, packet, destinationIp, expectedTarget, ruleIds, fidelity } = options;
  const base: HopBase = {
    step: 'route-lookup',
    component: { type: 'route-table', id: table.id },
    packet,
    ruleIds,
    fidelity,
  };
  const none = { internetGatewayId: null, natGatewayId: null };
  const routes = effectiveRoutes(model, table);
  const { route, shadowsActiveRoute } = lookupRoute(routes, mustParseIpv4(destinationIp));
  if (route === null) {
    return { hop: failed(base, 'NO_ROUTE_TO_DESTINATION'), ...none };
  }
  const match: HopMatch = {
    type: 'route',
    routeTableId: table.id,
    destinationCidrBlock: route.destinationCidrBlock,
    target: route.target,
    state: route.state,
  };
  if (route.state === 'blackhole') {
    const blackholeFidelity = shadowsActiveRoute
      ? lowestFidelity([fidelity, 'Inferred'])
      : fidelity;
    return {
      hop: failed(
        { ...base, fidelity: blackholeFidelity },
        shadowsActiveRoute ? 'MORE_SPECIFIC_ROUTE' : 'BAD_STATE_ROUTE',
        match,
      ),
      ...none,
    };
  }
  if (route.targetType === expectedTarget) {
    return {
      hop: passed(base, { match }),
      internetGatewayId: route.targetType === 'internet-gateway' ? route.target : null,
      natGatewayId: route.targetType === 'nat-gateway' ? route.target : null,
    };
  }
  if (route.targetType === 'nat-gateway') {
    const extra = options.unsupportedNatRuleId;
    const natRuleIds =
      extra === undefined || ruleIds.includes(extra) ? ruleIds : [...ruleIds, extra];
    return {
      hop: failed(
        { ...base, ruleIds: natRuleIds, fidelity: 'Unsupported' },
        'UNSUPPORTED_FEATURE',
        match,
      ),
      ...none,
    };
  }
  // Unreachable after the checks that block a trace: internet addresses are outside every
  // VPC CIDR (IGW-06) and no stored route lies inside one (RT-03). Reported, never followed.
  return { hop: failed(base, 'NO_ROUTE_TO_DESTINATION', match), ...none };
}

/**
 * The NAT gateway translates the packet (NAT-04): on the way out the source becomes its
 * private IP and NAT port, on the way back the destination becomes the instance again
 * (NAT-02, stateful). It has no security group (NAT-05). `NGW_REQUIRES_SOURCE_IN_VPC`
 * can't occur in R1: every source is an instance of the same VPC (NAT-03).
 *
 * Rules: NAT-02 to NAT-05 · https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html ·
 * https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html
 */
export function natStep(options: {
  natGatewayId: string;
  packet: Packet;
  translatedTo: Packet;
  ruleIds: readonly RuleId[];
}): HopDraft {
  const { natGatewayId, packet, translatedTo, ruleIds } = options;
  const base: HopBase = {
    step: 'nat-gateway',
    component: { type: 'nat-gateway', id: natGatewayId },
    packet,
    ruleIds,
    fidelity: 'Exact',
  };
  return passed(base, { translatedTo });
}

/**
 * Leaving through the internet gateway: the source needs a public IPv4 address (IGW-01), the
 * destination can't be RFC 1918 or RFC 6598 (IGW-03). Translates private → public.
 */
export function igwEgressStep(options: {
  internetGatewayId: string;
  packet: Packet;
  publicIp: string | null;
  ruleIds: readonly RuleId[];
}): HopDraft {
  const { internetGatewayId, packet, publicIp, ruleIds } = options;
  const base: HopBase = {
    step: 'igw-egress',
    component: { type: 'internet-gateway', id: internetGatewayId },
    packet,
    ruleIds,
    fidelity: 'Exact',
  };
  if (publicIp === null) return failed(base, 'IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS');
  const problem =
    packet.destinationIp === null ? null : egressDestinationProblem(packet.destinationIp);
  if (problem !== null) return failed(base, problem);
  return passed(base, { translatedTo: { ...packet, sourceIp: publicIp } });
}

/**
 * Entering through the internet gateway: the source can't be RFC 1918 or RFC 6598 (IGW-03).
 * Translates public → private (IGW-02). Used for responses (F2); F1 adds its own checks.
 */
export function igwIngressStep(options: {
  internetGatewayId: string;
  packet: Packet;
  privateIp: string;
  ruleIds: readonly RuleId[];
  fidelity: Fidelity;
}): HopDraft {
  const { internetGatewayId, packet, privateIp, ruleIds, fidelity } = options;
  const base: HopBase = {
    step: 'igw-ingress',
    component: { type: 'internet-gateway', id: internetGatewayId },
    packet,
    ruleIds,
    fidelity,
  };
  const problem = ingressSourceProblem(packet.sourceIp);
  if (problem !== null) return failed(base, problem);
  return passed(base, { translatedTo: { ...packet, destinationIp: privateIp } });
}

/**
 * The first hop of F1: an internet client reaches the VPC's internet gateway. Fails when the
 * VPC has no attached internet gateway (`NO_INTERNET_GATEWAY`, Inferred, Q10), when the
 * source is private or shared (IGW-03), or when the destination isn't the public address of
 * the interface (IGW-02). Then translates public → private. No route lookup happens on
 * arrival (RT-02, Inferred, Q1).
 */
export function edgeIngressStep(options: {
  internetGatewayId: string | null;
  vpcId: string;
  packet: Packet;
  targetsPublicAddress: boolean;
  privateIp: string;
}): HopDraft {
  const { internetGatewayId, vpcId, packet, targetsPublicAddress, privateIp } = options;
  const base: HopBase = {
    step: 'igw-ingress',
    component:
      internetGatewayId === null
        ? { type: 'vpc', id: vpcId }
        : { type: 'internet-gateway', id: internetGatewayId },
    packet,
    ruleIds: ['IGW-02', 'IGW-03', 'IGW-05', 'RT-02'],
    fidelity: 'Inferred',
  };
  if (internetGatewayId === null) return failed(base, 'NO_INTERNET_GATEWAY');
  const problem = ingressSourceProblem(packet.sourceIp);
  if (problem !== null) return failed(base, problem);
  if (!targetsPublicAddress || packet.destinationIp === null) {
    return failed(base, 'IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS');
  }
  return passed(base, { translatedTo: { ...packet, destinationIp: privateIp } });
}

/** TRC-01: a running service must listen on the destination port (`NO_LISTENER`, Inferred). */
export function hostStep(instance: Instance, packet: Packet, port: number): HopDraft {
  const base: HopBase = {
    step: 'host',
    component: { type: 'instance', id: instance.id },
    packet,
    ruleIds: ['TRC-01'],
    fidelity: 'Inferred',
  };
  // R0 services are TCP only, like R0 traces.
  const service = instance.runningServices.find((candidate) => candidate.port === port);
  return service === undefined
    ? failed(base, 'NO_LISTENER')
    : passed(base, { match: { type: 'service', port: service.port, name: service.name } });
}

/** TRC-02: routing and gateway hops break the path; filters and the host drop the packet. */
function verdictFor(step: HopStep): Exclude<Verdict, 'REACHED'> {
  switch (step) {
    case 'route-lookup':
    case 'igw-egress':
    case 'igw-ingress':
    case 'nat-gateway':
      return 'BROKE_AT_HOP';
    case 'sg-egress':
    case 'sg-ingress':
    case 'nacl-outbound':
    case 'nacl-inbound':
    case 'host':
      return 'ROUTED_THEN_DROPPED';
  }
}

/**
 * Runs the forward steps, then the return steps, and stops at the first failing hop
 * (TRC-02). Hop indexes are contiguous across both directions.
 */
export function runFlow(
  flow: EvaluatedTrace['flow'],
  client: TraceClient,
  forward: readonly Step[],
  back: readonly Step[],
): EvaluatedTrace {
  const hops: Hop[] = [];
  const directions: readonly (readonly [Direction, readonly Step[]])[] = [
    ['forward', forward],
    ['return', back],
  ];
  for (const [direction, steps] of directions) {
    for (const step of steps) {
      const hop: Hop = { index: hops.length, direction, ...step() };
      hops.push(hop);
      if (hop.outcome !== 'fail') continue;
      return {
        status: 'evaluated',
        flow,
        verdict: verdictFor(hop.step),
        failure: { direction, hopIndex: hop.index, reasonCodes: hop.reasonCodes },
        client,
        hops,
        fidelity: lowestFidelity(hops.map((h) => h.fidelity)),
      };
    }
  }
  return {
    status: 'evaluated',
    flow,
    verdict: 'REACHED',
    client,
    hops,
    fidelity: lowestFidelity(hops.map((h) => h.fidelity)),
  };
}
