import { describe, expect, it } from 'vitest';
import {
  associateRouteTable,
  createNatGateway,
  createRouteTable,
  createSubnet,
  deriveStatus,
  detachInternetGateway,
  launchInstance,
  nextPublicAddress,
  replaceRoutes,
  setNameTag,
  topologySchema,
  trace,
  validate,
  type EvaluatedTrace,
  type HelperResult,
  type Issue,
  type IssueCode,
  type Topology,
  type TopologyInput,
  type TraceQuery,
  type TraceResult,
} from '../src/index';
import { at, extraInstance, parseBase } from './fixtures/base';
import { natA, natBaseInput, parseNatBase } from './fixtures/nat';

/** Tests of docs/specs/r1-nat-gateway.md section 6. */

const SERVER_IP = '198.51.100.7';

type Change = (input: TopologyInput) => void;
type NaclEntryInput = TopologyInput['networkAcls'][number]['inboundEntries'][number];

/** F3: app-1 (private subnet) → internet server, port 443. */
function f3(overrides: Partial<TraceQuery> = {}): TraceQuery {
  return {
    protocol: 'tcp',
    source: { type: 'instance', instanceId: 'i-0000000b' },
    destination: { type: 'internet', ipAddress: SERVER_IP },
    destinationPort: 443,
    ...overrides,
  };
}

function evaluated(result: TraceResult): EvaluatedTrace {
  if (result.status !== 'evaluated') {
    throw new Error(`Expected an evaluated trace, got ${JSON.stringify(result.issues)}`);
  }
  return result;
}

function traceNat(change: Change, query: TraceQuery = f3()): EvaluatedTrace {
  return evaluated(trace(parseNatBase(change), query));
}

function issuesFor(change: Change): Issue[] {
  return validate(parseNatBase(change));
}

function withCode(issues: readonly Issue[], code: IssueCode): Issue[] {
  return issues.filter((issue) => issue.code === code);
}

function ok<T>(result: HelperResult<T>): { topology: Topology; created: T } {
  if (!result.ok) throw new Error(`Helper failed: ${JSON.stringify(result.error)}`);
  return result;
}

function tcpEntry(
  ruleNumber: number,
  fromPort: number,
  toPort = fromPort,
  cidrBlock = '0.0.0.0/0',
): NaclEntryInput {
  return { ruleNumber, protocol: 'tcp', fromPort, toPort, cidrBlock, action: 'allow' };
}

/** Associates a new network ACL (acl-0000000d) with the NAT gateway's subnet `public-a`. */
function natSubnetNacl(inboundEntries: NaclEntryInput[], outboundEntries: NaclEntryInput[]) {
  return (input: TopologyInput) => {
    input.networkAcls.push({
      id: 'acl-0000000d',
      vpcId: 'vpc-0a1b2c3d',
      inboundEntries,
      outboundEntries,
    });
    at(input.subnets, 0).networkAclId = 'acl-0000000d';
  };
}

const allowAll = (ruleNumber: number): NaclEntryInput => ({
  ruleNumber,
  protocol: 'all',
  cidrBlock: '0.0.0.0/0',
  action: 'allow',
});

/** A subnet 10.0.3.0/24 on the main route table (only the local route): a private subnet. */
function addMainTableSubnet(input: TopologyInput) {
  input.subnets.push({
    id: 'subnet-0000000c',
    vpcId: 'vpc-0a1b2c3d',
    cidrBlock: '10.0.3.0/24',
    availabilityZone: 'us-east-1a',
  });
}

function moveNatToPrivateSubnet(input: TopologyInput) {
  addMainTableSubnet(input);
  natA(input).subnetId = 'subnet-0000000c';
  natA(input).privateIpAddress = '10.0.3.20';
}

function detachGateway(input: TopologyInput) {
  delete at(input.internetGateways, 0).attachedVpcId;
}

/** The route table of `name` in `nat-base`. */
function table(input: TopologyInput, id: string) {
  const found = input.routeTables.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No route table ${id}`);
  return found;
}

describe('NAT gateway: schema', () => {
  it('NAT-06: a private NAT gateway or an unknown key is a schema error', () => {
    const privateNat = natBaseInput();
    (natA(privateNat) as { connectivityType: string }).connectivityType = 'private';
    expect(topologySchema.safeParse(privateNat).success).toBe(false);

    const regional = natBaseInput();
    Object.assign(natA(regional), { availabilityMode: 'regional' });
    expect(topologySchema.safeParse(regional).success).toBe(false);
  });

  it('NAT-06: the connectivity type defaults to public', () => {
    const topology = parseNatBase((input) => {
      delete (natA(input) as { connectivityType?: string }).connectivityType;
    });
    expect(at(topology.natGateways ?? [], 0).connectivityType).toBe('public');
  });

  it('SCHEMA: a topology without natGateways parses without adding the key', () => {
    expect('natGateways' in parseBase()).toBe(false);
  });

  it('SCHEMA: a route to an unknown NAT gateway or a duplicate NAT gateway ID is a schema error', () => {
    const unknown = natBaseInput();
    const route = at(table(unknown, 'rtb-00000003').routes, 0);
    route.target = { type: 'nat-gateway', natGatewayId: 'nat-0000000f' };
    const unknownResult = topologySchema.safeParse(unknown);
    expect(unknownResult.success).toBe(false);
    expect(JSON.stringify(unknownResult.error?.issues)).toContain('UNKNOWN_REFERENCE');

    const duplicate = natBaseInput();
    duplicate.natGateways?.push({ ...natA(duplicate), privateIpAddress: '10.0.1.21' });
    const duplicateResult = topologySchema.safeParse(duplicate);
    expect(duplicateResult.success).toBe(false);
    expect(JSON.stringify(duplicateResult.error?.issues)).toContain('DUPLICATE_ID');
  });
});

describe('NAT gateway: validate', () => {
  it('NAT-01: nat-base raises no issue', () => {
    expect(validate(parseNatBase())).toEqual([]);
  });

  it('NAT-01: a NAT gateway in a subnet without an internet gateway route raises NAT_SUBNET_NOT_PUBLIC', () => {
    const issues = issuesFor(moveNatToPrivateSubnet);
    expect(issues).toEqual([
      {
        code: 'NAT_SUBNET_NOT_PUBLIC',
        severity: 'warning',
        ruleIds: ['NAT-01', 'RT-09'],
        fidelity: 'Exact',
        resource: { type: 'nat-gateway', id: 'nat-0000000a' },
        path: ['natGateways', 0, 'subnetId'],
        related: [{ type: 'route-table', id: 'rtb-00000001' }],
        params: { subnetId: 'subnet-0000000c', routeTableId: 'rtb-00000001' },
      },
    ]);
  });

  it('NAT-07: a NAT gateway in a VPC without an attached internet gateway is an error', () => {
    expect(withCode(issuesFor(detachGateway), 'NAT_VPC_NO_INTERNET_GATEWAY')).toEqual([
      {
        code: 'NAT_VPC_NO_INTERNET_GATEWAY',
        severity: 'error',
        ruleIds: ['NAT-07', 'IGW-07'],
        fidelity: 'Inferred',
        resource: { type: 'nat-gateway', id: 'nat-0000000a' },
        path: ['natGateways', 0, 'subnetId'],
        params: { vpcId: 'vpc-0a1b2c3d' },
      },
    ]);
  });

  it("NAT-07: the NAT gateway's private IP is checked like an interface's", () => {
    const outside = issuesFor((input) => {
      natA(input).privateIpAddress = '10.0.2.20';
    });
    expect(withCode(outside, 'IP_OUT_OF_SUBNET')).toMatchObject([
      {
        ruleIds: ['ADR-09', 'NAT-07'],
        resource: { type: 'nat-gateway', id: 'nat-0000000a' },
        path: ['natGateways', 0, 'privateIpAddress'],
        params: { ipAddress: '10.0.2.20', subnetCidrBlock: '10.0.1.0/24' },
      },
    ]);

    const reserved = issuesFor((input) => {
      natA(input).privateIpAddress = '10.0.1.3';
    });
    expect(withCode(reserved, 'IP_RESERVED')).toMatchObject([
      {
        ruleIds: ['ADR-04', 'NAT-07'],
        resource: { type: 'nat-gateway', id: 'nat-0000000a' },
        params: { ipAddress: '10.0.1.3', purpose: 'future-use' },
      },
    ]);

    // nat-a comes before web-1 in topology key order, so web-1's interface gets the issue.
    const duplicate = issuesFor((input) => {
      natA(input).privateIpAddress = '10.0.1.10';
    });
    expect(withCode(duplicate, 'IP_DUPLICATE')).toMatchObject([
      {
        resource: { type: 'network-interface', id: 'eni-0000000a' },
        related: [{ type: 'nat-gateway', id: 'nat-0000000a' }],
        params: { ipAddress: '10.0.1.10', kind: 'private' },
      },
    ]);
  });

  it('NAT-07: an Elastic IP already used by an instance or another NAT gateway is IP_DUPLICATE', () => {
    const withInstance = issuesFor((input) => {
      natA(input).elasticIpAddress = '203.0.113.25';
    });
    expect(withCode(withInstance, 'IP_DUPLICATE')).toMatchObject([
      {
        resource: { type: 'network-interface', id: 'eni-0000000a' },
        related: [{ type: 'nat-gateway', id: 'nat-0000000a' }],
        params: { ipAddress: '203.0.113.25', kind: 'public' },
      },
    ]);

    const twoNats = issuesFor((input) => {
      input.natGateways?.push({
        id: 'nat-0000000b',
        subnetId: 'subnet-0000000a',
        connectivityType: 'public',
        privateIpAddress: '10.0.1.21',
        elasticIpAddress: '203.0.113.30',
      });
    });
    expect(withCode(twoNats, 'IP_DUPLICATE')).toEqual([
      {
        code: 'IP_DUPLICATE',
        severity: 'error',
        ruleIds: ['ADR-10', 'NAT-07'],
        fidelity: 'Exact',
        resource: { type: 'nat-gateway', id: 'nat-0000000b' },
        path: ['natGateways', 1, 'elasticIpAddress'],
        related: [{ type: 'nat-gateway', id: 'nat-0000000a' }],
        params: { ipAddress: '203.0.113.30', kind: 'public' },
      },
    ]);
  });

  it('ADR-10: a private Elastic IP is PUBLIC_IP_INVALID', () => {
    const issues = issuesFor((input) => {
      natA(input).elasticIpAddress = '192.168.1.1';
    });
    expect(withCode(issues, 'PUBLIC_IP_INVALID')).toMatchObject([
      {
        ruleIds: ['ADR-10', 'NAT-07'],
        resource: { type: 'nat-gateway', id: 'nat-0000000a' },
        path: ['natGateways', 0, 'elasticIpAddress'],
        params: { ipAddress: '192.168.1.1', reason: 'rfc1918', range: '192.168.0.0/16' },
      },
    ]);
  });

  it("NAT-08: six NAT gateways in one zone raise QUOTA_EXCEEDED; five don't", () => {
    const addNats = (count: number) => (input: TopologyInput) => {
      for (let i = 1; i <= count; i += 1) {
        input.natGateways?.push({
          id: `nat-0000000${(10 + i).toString(16)}`,
          subnetId: 'subnet-0000000a',
          connectivityType: 'public',
          privateIpAddress: `10.0.1.${String(20 + i)}`,
          elasticIpAddress: `203.0.113.${String(30 + i)}`,
        });
      }
    };
    expect(withCode(issuesFor(addNats(4)), 'QUOTA_EXCEEDED')).toEqual([]);
    expect(withCode(issuesFor(addNats(5)), 'QUOTA_EXCEEDED')).toEqual([
      {
        code: 'QUOTA_EXCEEDED',
        severity: 'warning',
        ruleIds: ['NAT-08'],
        fidelity: 'Exact',
        resource: { type: 'nat-gateway', id: 'nat-0000000f' },
        path: ['natGateways', 5, 'subnetId'],
        params: {
          quota: 'nat-gateways-per-az',
          availabilityZone: 'us-east-1a',
          limit: 5,
          count: 6,
        },
      },
    ]);
  });

  it('RT-05: a route to a NAT gateway of another VPC is VPC_MISMATCH (Q17)', () => {
    const issues = issuesFor((input) => {
      input.vpcs.push({
        id: 'vpc-0000000c',
        cidrBlock: '10.1.0.0/16',
        mainRouteTableId: 'rtb-0000000c',
        defaultNetworkAclId: 'acl-0000000c',
        defaultSecurityGroupId: 'sg-0000000c',
      });
      input.routeTables.push({
        id: 'rtb-0000000c',
        vpcId: 'vpc-0000000c',
        routes: [
          {
            destinationCidrBlock: '0.0.0.0/0',
            target: { type: 'nat-gateway', natGatewayId: 'nat-0000000a' },
          },
        ],
      });
      input.securityGroups.push({
        id: 'sg-0000000c',
        vpcId: 'vpc-0000000c',
        name: 'default',
        description: 'default VPC security group',
        inboundRules: [],
        outboundRules: [],
      });
      input.networkAcls.push({
        id: 'acl-0000000c',
        vpcId: 'vpc-0000000c',
        inboundEntries: [],
        outboundEntries: [],
      });
    });
    expect(withCode(issues, 'VPC_MISMATCH')).toEqual([
      {
        code: 'VPC_MISMATCH',
        severity: 'error',
        ruleIds: ['RT-05'],
        fidelity: 'Inferred',
        resource: { type: 'route-table', id: 'rtb-0000000c' },
        path: ['routeTables', 3, 'routes', 0, 'target', 'natGatewayId'],
        related: [{ type: 'nat-gateway', id: 'nat-0000000a' }],
        params: { vpcId: 'vpc-0000000c', otherVpcId: 'vpc-0a1b2c3d' },
      },
    ]);
  });
});

describe('NAT gateway: trace F3', () => {
  it('TRC-02: F3 reaches the internet through the NAT gateway', () => {
    const result = traceNat(() => undefined);
    expect(result.verdict).toBe('REACHED');
    expect(result.flow).toBe('F3');
    expect(result.failure).toBeUndefined();
    expect(result.client).toEqual({
      type: 'linux',
      portRange: { from: 32768, to: 61000 },
      sourcePort: 32768,
    });
    expect(result.hops.map((hop) => [hop.index, hop.direction, hop.step, hop.component])).toEqual([
      [0, 'forward', 'sg-egress', { type: 'network-interface', id: 'eni-0000000b' }],
      [1, 'forward', 'nacl-outbound', { type: 'subnet', id: 'subnet-0000000b' }],
      [2, 'forward', 'route-lookup', { type: 'route-table', id: 'rtb-00000003' }],
      [3, 'forward', 'nacl-inbound', { type: 'subnet', id: 'subnet-0000000a' }],
      [4, 'forward', 'nat-gateway', { type: 'nat-gateway', id: 'nat-0000000a' }],
      [5, 'forward', 'nacl-outbound', { type: 'subnet', id: 'subnet-0000000a' }],
      [6, 'forward', 'route-lookup', { type: 'route-table', id: 'rtb-00000002' }],
      [7, 'forward', 'igw-egress', { type: 'internet-gateway', id: 'igw-0000000a' }],
      [8, 'return', 'igw-ingress', { type: 'internet-gateway', id: 'igw-0000000a' }],
      [9, 'return', 'nacl-inbound', { type: 'subnet', id: 'subnet-0000000a' }],
      [10, 'return', 'nat-gateway', { type: 'nat-gateway', id: 'nat-0000000a' }],
      [11, 'return', 'nacl-outbound', { type: 'subnet', id: 'subnet-0000000a' }],
      [12, 'return', 'route-lookup', { type: 'route-table', id: 'rtb-00000002' }],
      [13, 'return', 'nacl-inbound', { type: 'subnet', id: 'subnet-0000000b' }],
      [14, 'return', 'sg-ingress', { type: 'network-interface', id: 'eni-0000000b' }],
    ]);
    expect(result.hops.every((hop) => hop.outcome !== 'fail')).toBe(true);

    const tcp = (sourceIp: string, sourcePort: number, destinationIp: string, port: number) => ({
      protocol: 'tcp',
      sourceIp,
      sourcePort,
      destinationIp,
      destinationPort: port,
    });
    const request = tcp('10.0.2.10', 32768, SERVER_IP, 443);
    const fromNat = tcp('10.0.1.20', 1024, SERVER_IP, 443);
    const hop = (index: number) => at(result.hops, index);
    expect(hop(0).packet).toEqual(request);
    expect(hop(4).packet).toEqual(request);
    expect(hop(4).translatedTo).toEqual(fromNat);
    expect(hop(5).packet).toEqual(fromNat);
    expect(hop(7).translatedTo).toEqual(tcp('203.0.113.30', 1024, SERVER_IP, 443));
    expect(hop(8).packet).toEqual(tcp(SERVER_IP, 443, '203.0.113.30', 1024));
    expect(hop(8).translatedTo).toEqual(tcp(SERVER_IP, 443, '10.0.1.20', 1024));
    expect(hop(10).translatedTo).toEqual(tcp(SERVER_IP, 443, '10.0.2.10', 32768));
    expect(hop(13).packet).toEqual(tcp(SERVER_IP, 443, '10.0.2.10', 32768));

    expect(hop(2).match).toEqual({
      type: 'route',
      routeTableId: 'rtb-00000003',
      destinationCidrBlock: '0.0.0.0/0',
      target: 'nat-0000000a',
      state: 'active',
    });
    expect(hop(6).match).toMatchObject({ target: 'igw-0000000a', state: 'active' });
    expect(hop(12).match).toMatchObject({ destinationCidrBlock: '10.0.0.0/16', target: 'local' });
    expect(hop(4).ruleIds).toEqual(['NAT-03', 'NAT-04', 'NAT-05']);
    expect(hop(10).ruleIds).toEqual(['NAT-02', 'NAT-04']);
    expect(hop(12).fidelity).toBe('Inferred');
    expect(result.fidelity).toBe('Inferred');
  });

  it('NAT-05: no security group hop at the NAT gateway', () => {
    const result = traceNat(() => undefined);
    const natHops = result.hops.filter((hop) => hop.component.id === 'nat-0000000a');
    expect(natHops.map((hop) => hop.step)).toEqual(['nat-gateway', 'nat-gateway']);
    expect(result.hops.filter((hop) => hop.step.startsWith('sg-')).map((hop) => hop.index)).toEqual(
      [0, 14],
    );
  });

  it('NAT-04: the NAT port can be chosen', () => {
    const result = traceNat(() => undefined, f3({ natSourcePort: 40000 }));
    expect(result.verdict).toBe('REACHED');
    expect(at(result.hops, 4).translatedTo?.sourcePort).toBe(40000);
    expect(at(result.hops, 8).packet.destinationPort).toBe(40000);
  });

  it('NAT-04: a NAT port outside 1024-65535 is rejected', () => {
    for (const natSourcePort of [80, 1023, 65536]) {
      const result = trace(parseNatBase(), f3({ natSourcePort }));
      expect(result).toEqual({
        status: 'blocked',
        issues: [
          {
            code: 'INVALID_QUERY',
            severity: 'error',
            ruleIds: ['NAT-04'],
            fidelity: 'Exact',
            path: ['query', 'natSourcePort'],
            params: {
              reason: 'nat-source-port-out-of-range',
              natSourcePort,
              from: 1024,
              to: 65535,
            },
          },
        ],
      });
    }
  });

  it('NAT-05: the NAT subnet NACL must let the reply in on 1024-65535', () => {
    const result = traceNat(
      natSubnetNacl([tcpEntry(100, 443, 443, '10.0.0.0/16')], [allowAll(100)]),
    );
    expect(result.verdict).toBe('ROUTED_THEN_DROPPED');
    expect(result.failure).toEqual({
      direction: 'return',
      hopIndex: 9,
      reasonCodes: ['SUBNET_ACL_RESTRICTION'],
    });
    expect(at(result.hops, 9).match).toEqual({
      type: 'nacl-entry',
      networkAclId: 'acl-0000000d',
      ruleNumber: '*',
      action: 'deny',
    });
  });

  it('EPH-03: allowing 1024-65535 inbound on the NAT subnet fixes it', () => {
    const result = traceNat(
      natSubnetNacl(
        [tcpEntry(100, 443, 443, '10.0.0.0/16'), tcpEntry(110, 1024, 65535)],
        [allowAll(100)],
      ),
    );
    expect(result.verdict).toBe('REACHED');
  });

  it('NAT-05: the NAT subnet NACL must let the private subnet in', () => {
    const deny: NaclEntryInput = {
      ruleNumber: 90,
      protocol: 'all',
      cidrBlock: '10.0.2.0/24',
      action: 'deny',
    };
    const result = traceNat(natSubnetNacl([deny, allowAll(100)], [allowAll(100)]));
    expect(result.verdict).toBe('ROUTED_THEN_DROPPED');
    expect(result.failure).toMatchObject({ direction: 'forward', hopIndex: 3 });
    expect(at(result.hops, 3).match).toMatchObject({ ruleNumber: 90, action: 'deny' });
  });

  it('NAT-05: the NAT subnet NACL must let the reply out to the instance', () => {
    const result = traceNat(natSubnetNacl([allowAll(100)], [tcpEntry(100, 443)]));
    expect(result.verdict).toBe('ROUTED_THEN_DROPPED');
    expect(result.failure).toMatchObject({ direction: 'return', hopIndex: 11 });
  });

  it('NAT-01: a NAT gateway in a private subnet breaks at its route lookup', () => {
    const topology = parseNatBase(moveNatToPrivateSubnet);
    expect(validate(topology).map((issue) => issue.code)).toEqual(['NAT_SUBNET_NOT_PUBLIC']);
    const result = evaluated(trace(topology, f3()));
    expect(result.verdict).toBe('BROKE_AT_HOP');
    expect(result.failure).toEqual({
      direction: 'forward',
      hopIndex: 6,
      reasonCodes: ['NO_ROUTE_TO_DESTINATION'],
    });
    expect(at(result.hops, 6).component).toEqual({ type: 'route-table', id: 'rtb-00000001' });
  });

  it('RT-04: a more specific internet gateway route bypasses the NAT gateway', () => {
    const result = traceNat((input) => {
      table(input, 'rtb-00000003').routes.push({
        destinationCidrBlock: '198.51.100.0/24',
        target: { type: 'internet-gateway', internetGatewayId: 'igw-0000000a' },
      });
    });
    expect(result.flow).toBe('F2');
    expect(result.verdict).toBe('BROKE_AT_HOP');
    expect(result.failure).toEqual({
      direction: 'forward',
      hopIndex: 3,
      reasonCodes: ['IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS'],
    });
  });

  it("NAT-02: an internet client can't reach an instance behind a NAT gateway", () => {
    const result = traceNat(() => undefined, {
      protocol: 'tcp',
      source: { type: 'internet', ipAddress: SERVER_IP },
      destination: { type: 'instance', instanceId: 'i-0000000b', address: 'public' },
      destinationPort: 80,
    });
    expect(result.flow).toBe('F1');
    expect(result.verdict).toBe('BROKE_AT_HOP');
    expect(result.failure).toEqual({
      direction: 'forward',
      hopIndex: 0,
      reasonCodes: ['IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS'],
    });
    expect(at(result.hops, 0).packet.destinationIp).toBeNull();
  });

  it('SG-02: no outbound rules, no NAT gateway use', () => {
    const result = traceNat((input) => {
      at(input.securityGroups, 2).outboundRules = [];
    });
    expect(result.verdict).toBe('ROUTED_THEN_DROPPED');
    expect(result.failure).toEqual({
      direction: 'forward',
      hopIndex: 0,
      reasonCodes: ['SG_HAS_NO_RULES'],
    });
  });

  it('SG-01: the reply skips the instance security group', () => {
    const hop = at(traceNat(() => undefined).hops, 14);
    expect(hop.outcome).toBe('skipped');
    expect(hop.skippedBecause).toBe('stateful-response');
  });

  it('NAT-09: a subnet in another zone can use the NAT gateway', () => {
    const change: Change = (input) => {
      at(input.subnets, 1).availabilityZone = 'us-east-1b';
    };
    expect(issuesFor(change)).toEqual([]);
    expect(traceNat(change).verdict).toBe('REACHED');
  });

  it('NAT-02: a reply routed to a NAT gateway is unsupported (Q15)', () => {
    const result = traceNat(
      (input) => {
        input.instances.push({
          id: 'i-0000000c',
          name: 'web-2',
          platform: 'linux',
          primaryNetworkInterface: {
            id: 'eni-0000000c',
            subnetId: 'subnet-0000000b',
            privateIpAddress: '10.0.2.11',
            publicIp: { kind: 'auto-assigned', address: '203.0.113.26' },
            securityGroupIds: ['sg-0000000a'],
          },
          runningServices: [{ protocol: 'tcp', port: 80, name: 'nginx' }],
        });
      },
      {
        protocol: 'tcp',
        source: { type: 'internet', ipAddress: SERVER_IP },
        destination: { type: 'instance', instanceId: 'i-0000000c', address: 'public' },
        destinationPort: 80,
      },
    );
    expect(result.flow).toBe('F1');
    expect(result.verdict).toBe('BROKE_AT_HOP');
    expect(result.failure).toEqual({
      direction: 'return',
      hopIndex: 6,
      reasonCodes: ['UNSUPPORTED_FEATURE'],
    });
    const hop = at(result.hops, 6);
    expect(hop.step).toBe('route-lookup');
    expect(hop.match).toMatchObject({ target: 'nat-0000000a', state: 'active' });
    expect(hop.fidelity).toBe('Unsupported');
    expect(result.fidelity).toBe('Unsupported');
  });

  it('NAT-01: a NAT subnet route to a NAT gateway is unsupported (Q16)', () => {
    const result = traceNat((input) => {
      table(input, 'rtb-00000002').routes.push({
        destinationCidrBlock: '198.51.100.0/24',
        target: { type: 'nat-gateway', natGatewayId: 'nat-0000000a' },
      });
    });
    expect(result.flow).toBe('F3');
    expect(result.verdict).toBe('BROKE_AT_HOP');
    expect(result.failure).toEqual({
      direction: 'forward',
      hopIndex: 6,
      reasonCodes: ['UNSUPPORTED_FEATURE'],
    });
    expect(result.fidelity).toBe('Unsupported');
  });

  it('NAT-07: a NAT gateway in a VPC without an internet gateway blocks the trace', () => {
    const result = trace(parseNatBase(detachGateway), f3());
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.issues.map((issue) => issue.code)).toEqual(['NAT_VPC_NO_INTERNET_GATEWAY']);
  });

  it("IGW-06: the NAT gateway's Elastic IP as an internet address is a hairpin", () => {
    const destination = trace(
      parseNatBase(),
      f3({ destination: { type: 'internet', ipAddress: '203.0.113.30' } }),
    );
    expect(destination).toEqual({
      status: 'blocked',
      issues: [
        {
          code: 'UNSUPPORTED_FEATURE',
          severity: 'error',
          ruleIds: ['IGW-06'],
          fidelity: 'Unsupported',
          path: ['query', 'destination', 'ipAddress'],
          related: [{ type: 'nat-gateway', id: 'nat-0000000a' }],
          params: { feature: 'igw-hairpin' },
        },
      ],
    });
    const source = trace(parseNatBase(), {
      protocol: 'tcp',
      source: { type: 'internet', ipAddress: '203.0.113.30' },
      destination: { type: 'instance', instanceId: 'i-0000000a', address: 'public' },
      destinationPort: 80,
    });
    expect(source.status).toBe('blocked');
  });

  it('TRC-05: F3 gives the same result for the same input', () => {
    const first = trace(parseNatBase(), f3());
    const second = trace(parseNatBase(), f3());
    expect(second).toEqual(first);
    expect(evaluated(first).hops.map((hop) => hop.index)).toEqual([...Array(15).keys()]);
  });
});

describe('NAT gateway: deriveStatus', () => {
  it('NAT-01: status lists the NAT gateway as available and public, with its zone and addresses', () => {
    expect(deriveStatus(parseNatBase()).natGateways).toEqual({
      'nat-0000000a': {
        state: 'available',
        connectivityType: 'public',
        vpcId: 'vpc-0a1b2c3d',
        subnetId: 'subnet-0000000a',
        availabilityZone: 'us-east-1a',
        privateIpAddress: '10.0.1.20',
        elasticIpAddress: '203.0.113.30',
      },
    });
    expect(deriveStatus(parseBase()).natGateways).toEqual({});
  });

  it('NAT-07: a NAT gateway uses one address of its subnet', () => {
    const { subnets } = deriveStatus(parseNatBase());
    expect(subnets['subnet-0000000a']?.availableIpv4Count).toBe(249);
    expect(subnets['subnet-0000000b']?.availableIpv4Count).toBe(250);
  });

  it("RT-09: a route to a NAT gateway doesn't make a subnet public", () => {
    const { subnets } = deriveStatus(parseNatBase());
    expect(subnets['subnet-0000000b']?.type).toBe('private');
    expect(subnets['subnet-0000000a']?.type).toBe('public');
  });

  it('RT-05: a route to a NAT gateway is active', () => {
    expect(deriveStatus(parseNatBase()).routeTables['rtb-00000003']?.routes).toEqual([
      {
        destinationCidrBlock: '10.0.0.0/16',
        target: 'local',
        state: 'active',
        origin: 'CreateRouteTable',
      },
      {
        destinationCidrBlock: '0.0.0.0/0',
        target: 'nat-0000000a',
        state: 'active',
        origin: 'CreateRoute',
      },
    ]);
  });
});

describe('NAT gateway: helpers', () => {
  it('NAT-07: createNatGateway picks the first free address and allocates an Elastic IP from the pool', () => {
    const { topology, created } = ok(
      createNatGateway(parseBase(), { subnetId: 'subnet-0000000a', name: 'nat-a' }),
    );
    expect(created).toEqual({
      natGatewayId: 'nat-00000001',
      privateIpAddress: '10.0.1.4',
      elasticIpAddress: '203.0.113.1',
    });
    expect(topology.natGateways).toEqual([
      {
        id: 'nat-00000001',
        name: 'nat-a',
        subnetId: 'subnet-0000000a',
        connectivityType: 'public',
        privateIpAddress: '10.0.1.4',
        elasticIpAddress: '203.0.113.1',
      },
    ]);
    expect(validate(topology)).toEqual([]);

    const chosen = ok(
      createNatGateway(parseBase(), { subnetId: 'subnet-0000000a', privateIpAddress: '10.0.1.50' }),
    );
    expect(chosen.created.privateIpAddress).toBe('10.0.1.50');
  });

  it('NAT-01: nextPublicAddress previews the Elastic IP that createNatGateway allocates', () => {
    expect(nextPublicAddress(parseBase())).toBe('203.0.113.1');
    const { created } = ok(createNatGateway(parseBase(), { subnetId: 'subnet-0000000a' }));
    expect(created.elasticIpAddress).toBe('203.0.113.1');
    // The pool doesn't depend on the internet gateway (the console allocates before creating).
    expect(nextPublicAddress(parseBase(detachGateway))).toBe('203.0.113.1');
    // Addresses already used by NAT gateways are skipped (nat-base uses 203.0.113.30).
    expect(nextPublicAddress(parseNatBase())).not.toBe('203.0.113.30');
  });

  it('HELPERS: a NAT gateway Name tag is set, and an empty name removes it', () => {
    const named = ok(
      setNameTag(parseNatBase(), { type: 'nat-gateway', id: 'nat-0000000a' }, 'egress'),
    );
    expect(named.topology.natGateways?.[0]?.name).toBe('egress');
    const cleared = ok(setNameTag(named.topology, { type: 'nat-gateway', id: 'nat-0000000a' }, ''));
    expect(cleared.topology.natGateways?.[0]).not.toHaveProperty('name');
    const unknown = setNameTag(parseBase(), { type: 'nat-gateway', id: 'nat-0000000a' }, 'x');
    expect(unknown.ok).toBe(false);
  });

  it('NAT-07: createNatGateway fails without an attached internet gateway', () => {
    const result = createNatGateway(parseBase(detachGateway), { subnetId: 'subnet-0000000a' });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'NAT_VPC_NO_INTERNET_GATEWAY',
        ruleIds: ['NAT-07'],
        params: { vpcId: 'vpc-0a1b2c3d', subnetId: 'subnet-0000000a' },
      },
    });
  });

  it('NAT-07: createNatGateway fails in a full subnet or an unknown one', () => {
    const full = parseBase((input) => {
      input.subnets.push({
        id: 'subnet-0000000f',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.9.0/28',
        availabilityZone: 'us-east-1a',
      });
      for (let host = 4; host <= 14; host += 1) {
        input.instances.push(
          extraInstance(
            `000000${(0xf0 + host).toString(16)}`,
            `10.0.9.${String(host)}`,
            'subnet-0000000f',
          ),
        );
      }
    });
    const result = createNatGateway(full, { subnetId: 'subnet-0000000f' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NO_FREE_PRIVATE_ADDRESS');

    const unknown = createNatGateway(parseBase(), { subnetId: 'subnet-0000000f' });
    expect(unknown).toEqual({
      ok: false,
      error: {
        code: 'UNKNOWN_REFERENCE',
        ruleIds: [],
        params: { referenceType: 'subnet', id: 'subnet-0000000f' },
      },
    });
  });

  it('NAT-01: createNatGateway in a private subnet succeeds and validate warns', () => {
    const { topology } = ok(
      createNatGateway(parseBase(addMainTableSubnet), { subnetId: 'subnet-0000000c' }),
    );
    expect(validate(topology).map((issue) => issue.code)).toEqual(['NAT_SUBNET_NOT_PUBLIC']);
  });

  it("ADR-09: launch skips the NAT gateway's private IP and Elastic IP", () => {
    const nat = ok(createNatGateway(parseBase(), { subnetId: 'subnet-0000000a' }));
    const launched = ok(
      launchInstance(nat.topology, { subnetId: 'subnet-0000000a', platform: 'linux' }),
    );
    const eni = at(launched.topology.instances, 1).primaryNetworkInterface;
    expect(eni.privateIpAddress).toBe('10.0.1.5');
    expect(eni.publicIp?.address).toBe('203.0.113.2');
  });

  it('IGW-07: detach is rejected while a NAT gateway has an Elastic IP', () => {
    const onlyNat = parseNatBase((input) => {
      delete at(input.instances, 0).primaryNetworkInterface.publicIp;
    });
    expect(detachInternetGateway(onlyNat, 'igw-0000000a')).toEqual({
      ok: false,
      error: {
        code: 'IGW_HAS_PUBLIC_ADDRESSES',
        ruleIds: ['IGW-07', 'NAT-07'],
        params: { internetGatewayId: 'igw-0000000a', vpcId: 'vpc-0a1b2c3d', count: 1 },
      },
    });
    const both = detachInternetGateway(parseNatBase(), 'igw-0000000a');
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.error.params.count).toBe(2);
  });

  it('HELPERS: console steps build nat-base, then F3 reaches the internet', () => {
    let topology = parseBase();
    const subnet = ok(
      createSubnet(topology, {
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.2.0/24',
        name: 'private-a',
      }),
    );
    topology = subnet.topology;
    const routeTable = ok(
      createRouteTable(topology, { vpcId: 'vpc-0a1b2c3d', name: 'private-rt' }),
    );
    topology = routeTable.topology;
    const nat = ok(createNatGateway(topology, { subnetId: 'subnet-0000000a', name: 'nat-a' }));
    topology = nat.topology;
    topology = ok(
      replaceRoutes(topology, routeTable.created.routeTableId, [
        {
          destinationCidrBlock: '0.0.0.0/0',
          target: { type: 'nat-gateway', natGatewayId: nat.created.natGatewayId },
        },
      ]),
    ).topology;
    topology = ok(
      associateRouteTable(topology, subnet.created.subnetId, routeTable.created.routeTableId),
    ).topology;
    const app = ok(
      launchInstance(topology, {
        subnetId: subnet.created.subnetId,
        platform: 'linux',
        name: 'app-1',
      }),
    );
    expect(validate(app.topology)).toEqual([]);
    const result = evaluated(
      trace(app.topology, f3({ source: { type: 'instance', instanceId: app.created.instanceId } })),
    );
    expect(result.flow).toBe('F3');
    expect(result.verdict).toBe('REACHED');
  });
});
