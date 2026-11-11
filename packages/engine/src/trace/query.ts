import {
  classifyNonPublic,
  formatCidr,
  mustParseCidr,
  mustParseIpv4,
  parseIpv4,
  toBlock,
} from '../cidr';
import {
  CLIENT_PORT_RANGES,
  effectiveRoutes,
  lookupRoute,
  natGatewaysOf,
  routeTableOf,
  type Model,
} from '../model';
import { mustGet } from '../internal/lookup';
import type { RuleId } from '../rules';
import type { NatGateway } from '../schema';
import { endpointOf, type Endpoint } from './flows';
import type { QueryIssue, TraceClient, TraceQuery } from './types';

export type TracePlan =
  | { flow: 'F0'; client: TraceClient; port: number; source: Endpoint; destination: Endpoint }
  | {
      flow: 'F1';
      client: TraceClient;
      port: number;
      clientIp: string;
      destination: Endpoint;
      address: 'public' | 'private';
    }
  | { flow: 'F2'; client: TraceClient; port: number; source: Endpoint; serverIp: string }
  | {
      flow: 'F3';
      client: TraceClient;
      port: number;
      source: Endpoint;
      serverIp: string;
      nat: NatGateway;
      natPort: number;
    };

/** NAT-04: a NAT gateway remaps source ports to this range; the default port is the first. */
export const NAT_PORT_RANGE = CLIENT_PORT_RANGES['nat-gateway'];

export type PlanResult =
  | { readonly ok: true; readonly plan: TracePlan }
  | { readonly ok: false; readonly issues: readonly QueryIssue[] };

type QueryPath = QueryIssue['path'];

function invalidQuery(
  path: QueryPath,
  ruleIds: readonly RuleId[],
  params: QueryIssue['params'],
): QueryIssue {
  return { code: 'INVALID_QUERY', severity: 'error', ruleIds, fidelity: 'Exact', path, params };
}

/**
 * Checks a query and picks its flow (docs/specs/r0-engine.md sections 5.1 and 5.3).
 * Returns every query issue it finds, in a fixed order, or the plan.
 *
 * Rules:
 * - TRC-03 supported shapes (F0, F1, F2, F3): .claude/skills/aws-network-rules/references/trace-model.md
 * - F3 when the source subnet's route to the destination targets a NAT gateway (RT-04, NAT-04):
 *   docs/specs/r1-nat-gateway.md section 4.1 and https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
 * - TRC-04 instances in different VPCs are disconnected until R2: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 * - IGW-06 internet addresses must be public; hairpin through the internet gateway is
 *   Unsupported: https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 * - EPH-01, EPH-02 client type and source port: https://docs.aws.amazon.com/vpc/latest/userguide/custom-network-acl.html
 */
export function planTrace(model: Model, query: TraceQuery): PlanResult {
  const issues: QueryIssue[] = [];
  const source = resolveInstance(model, query.source, 'source', issues);
  const destination = resolveInstance(model, query.destination, 'destination', issues);
  if (issues.length > 0) return { ok: false, issues };

  if (query.source.type === 'internet' && query.destination.type === 'internet') {
    issues.push(
      invalidQuery(['query', 'destination'], ['TRC-03'], { reason: 'internet-to-internet' }),
    );
  }
  if (source !== null && destination !== null && source.instance.id === destination.instance.id) {
    issues.push(
      invalidQuery(['query', 'destination', 'instanceId'], ['TRC-03'], { reason: 'same-endpoint' }),
    );
  }
  if (!isPort(query.destinationPort, 1)) {
    issues.push(
      invalidQuery(['query', 'destinationPort'], ['TRC-03'], {
        reason: 'destination-port-out-of-range',
        destinationPort: query.destinationPort,
      }),
    );
  }
  if (query.source.type === 'internet') {
    checkInternetAddress(model, query.source.ipAddress, 'source', issues);
  }
  if (query.destination.type === 'internet') {
    checkInternetAddress(model, query.destination.ipAddress, 'destination', issues);
  }
  if (
    source !== null &&
    destination !== null &&
    query.destination.type === 'instance' &&
    source.instance.id !== destination.instance.id
  ) {
    checkInstancePair(source, destination, query.destination.address, issues);
  }
  const natPort = query.natSourcePort ?? NAT_PORT_RANGE.from;
  if (!isPort(natPort, NAT_PORT_RANGE.from) || natPort > NAT_PORT_RANGE.to) {
    issues.push(
      invalidQuery(['query', 'natSourcePort'], ['NAT-04'], {
        reason: 'nat-source-port-out-of-range',
        natSourcePort: natPort,
        from: NAT_PORT_RANGE.from,
        to: NAT_PORT_RANGE.to,
      }),
    );
  }
  const client = resolveClient(query, source, issues);
  if (issues.length > 0 || client === null) return { ok: false, issues };

  const port = query.destinationPort;
  if (query.source.type === 'internet' && query.destination.type === 'instance' && destination) {
    const { ipAddress: clientIp } = query.source;
    const { address } = query.destination;
    return { ok: true, plan: { flow: 'F1', client, port, clientIp, destination, address } };
  }
  if (query.destination.type === 'internet' && source !== null) {
    const serverIp = query.destination.ipAddress;
    const nat = natGatewayOnTheWay(model, source, serverIp);
    if (nat !== null) {
      return { ok: true, plan: { flow: 'F3', client, port, source, serverIp, nat, natPort } };
    }
    return { ok: true, plan: { flow: 'F2', client, port, source, serverIp } };
  }
  if (source !== null && destination !== null) {
    return { ok: true, plan: { flow: 'F0', client, port, source, destination } };
  }
  // Every other shape raised an issue above.
  return { ok: false, issues };
}

/** The NAT gateway the source subnet's route table picks for `serverIp`, if any (RT-04). */
function natGatewayOnTheWay(model: Model, source: Endpoint, serverIp: string): NatGateway | null {
  const { table } = routeTableOf(model, source.subnet);
  const { route } = lookupRoute(effectiveRoutes(model, table), mustParseIpv4(serverIp));
  if (route?.targetType !== 'nat-gateway') return null;
  return mustGet(model.natGateways, route.target);
}

function resolveInstance(
  model: Model,
  side: TraceQuery['source'] | TraceQuery['destination'],
  sideName: 'source' | 'destination',
  issues: QueryIssue[],
): Endpoint | null {
  if (side.type !== 'instance') return null;
  const instance = model.instances.get(side.instanceId);
  if (instance !== undefined) return endpointOf(model, instance);
  issues.push({
    code: 'UNKNOWN_REFERENCE',
    severity: 'error',
    ruleIds: [],
    fidelity: 'Exact',
    path: ['query', sideName, 'instanceId'],
    params: { referenceType: 'instance', id: side.instanceId },
  });
  return null;
}

function isPort(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min && value <= 65535;
}

/** IGW-06: an internet address must be a valid public IPv4 address outside the topology. */
function checkInternetAddress(
  model: Model,
  ipAddress: string,
  sideName: 'source' | 'destination',
  issues: QueryIssue[],
): void {
  const path: QueryPath = ['query', sideName, 'ipAddress'];
  const address = parseIpv4(ipAddress);
  if (address === null) {
    issues.push(invalidQuery(path, [], { reason: 'invalid-ip-address', ipAddress }));
    return;
  }
  const vpcBlocks = model.topology.vpcs.map((vpc) => mustParseCidr(vpc.cidrBlock));
  const nonPublic = classifyNonPublic(toBlock(address, 32), vpcBlocks);
  if (nonPublic !== null) {
    issues.push({
      code: 'IGW_EXPECTS_PUBLIC_ADDRESS',
      severity: 'error',
      ruleIds: ['IGW-06'],
      fidelity: 'Exact',
      path,
      params: { ipAddress, reason: nonPublic.reason, range: formatCidr(nonPublic.range) },
    });
    return;
  }
  // The public address of a modeled instance or NAT gateway would make the path a hairpin.
  const instance = model.topology.instances.find(
    (candidate) => candidate.primaryNetworkInterface.publicIp?.address === ipAddress,
  );
  const nat = natGatewaysOf(model.topology).find(
    (candidate) => candidate.elasticIpAddress === ipAddress,
  );
  const owner =
    instance !== undefined
      ? ({ type: 'instance', id: instance.id } as const)
      : nat !== undefined
        ? ({ type: 'nat-gateway', id: nat.id } as const)
        : null;
  if (owner !== null) {
    issues.push({
      code: 'UNSUPPORTED_FEATURE',
      severity: 'error',
      ruleIds: ['IGW-06'],
      fidelity: 'Unsupported',
      path,
      related: [owner],
      params: { feature: 'igw-hairpin' },
    });
  }
}

/** Instance → instance: only by private address (IGW-06) and within one VPC (TRC-04). */
function checkInstancePair(
  source: Endpoint,
  destination: Endpoint,
  address: 'public' | 'private',
  issues: QueryIssue[],
): void {
  if (address === 'public') {
    issues.push({
      code: 'UNSUPPORTED_FEATURE',
      severity: 'error',
      ruleIds: ['IGW-06'],
      fidelity: 'Unsupported',
      path: ['query', 'destination', 'address'],
      related: [{ type: 'instance', id: destination.instance.id }],
      params: { feature: 'igw-hairpin' },
    });
    return;
  }
  if (source.vpc.id !== destination.vpc.id) {
    issues.push({
      code: 'DISCONNECTED_VPCS',
      severity: 'error',
      ruleIds: ['TRC-04'],
      fidelity: 'Exact',
      path: ['query', 'destination', 'instanceId'],
      related: [
        { type: 'instance', id: source.instance.id },
        { type: 'instance', id: destination.instance.id },
      ],
      params: { vpcId: source.vpc.id, otherVpcId: destination.vpc.id },
    });
  }
}

/** EPH-02: the client type and one concrete source port inside its range (EPH-01). */
function resolveClient(
  query: TraceQuery,
  source: Endpoint | null,
  issues: QueryIssue[],
): TraceClient | null {
  const type = query.clientType ?? source?.instance.platform ?? 'linux';
  const portRange = { ...CLIENT_PORT_RANGES[type] };
  const path: QueryPath = ['query', 'sourcePort'];
  if (query.sourcePort === undefined) {
    if (type !== 'custom') return { type, portRange, sourcePort: portRange.from };
    issues.push(
      invalidQuery(path, ['EPH-02'], { reason: 'source-port-required', clientType: type }),
    );
    return null;
  }
  const sourcePort = query.sourcePort;
  if (isPort(sourcePort, portRange.from) && sourcePort <= portRange.to) {
    return { type, portRange, sourcePort };
  }
  issues.push(
    invalidQuery(path, ['EPH-02'], {
      reason: 'source-port-out-of-range',
      clientType: type,
      sourcePort,
      from: portRange.from,
      to: portRange.to,
    }),
  );
  return null;
}
