import { describe, expect, it } from 'vitest';
import {
  trace,
  type EvaluatedTrace,
  type TopologyInput,
  type TraceQuery,
  type TraceResult,
} from '../src/index';
import { addOtherVpc, at, extraInstance, parseBase } from './fixtures/base';

/** The internet client of docs/specs/r0-engine.md section 8 (RFC 5737 documentation range). */
const CLIENT_IP = '198.51.100.7';

type NaclEntryInput = TopologyInput['networkAcls'][number]['inboundEntries'][number];
type Change = (input: TopologyInput) => void;
const noChange: Change = () => undefined;

/** F1: internet client → web-1. */
function f1(destinationPort = 80, overrides: Partial<TraceQuery> = {}): TraceQuery {
  return {
    protocol: 'tcp',
    source: { type: 'internet', ipAddress: CLIENT_IP },
    destination: { type: 'instance', instanceId: 'i-0000000a', address: 'public' },
    destinationPort,
    ...overrides,
  };
}

/** F2: web-1 → internet server. */
function f2(ipAddress = CLIENT_IP, destinationPort = 443): TraceQuery {
  return {
    protocol: 'tcp',
    source: { type: 'instance', instanceId: 'i-0000000a' },
    destination: { type: 'internet', ipAddress },
    destinationPort,
  };
}

/** F0: instance → instance by private address. */
function f0(sourceId: string, destinationId: string, destinationPort = 80): TraceQuery {
  return {
    protocol: 'tcp',
    source: { type: 'instance', instanceId: sourceId },
    destination: { type: 'instance', instanceId: destinationId, address: 'private' },
    destinationPort,
  };
}

function evaluated(result: TraceResult): EvaluatedTrace {
  if (result.status !== 'evaluated') {
    throw new Error(`Expected an evaluated trace, got ${JSON.stringify(result.issues)}`);
  }
  return result;
}

function traceBase(change: Change, query: TraceQuery): EvaluatedTrace {
  return evaluated(trace(parseBase(change), query));
}

function lastHop(result: EvaluatedTrace) {
  return at(result.hops, result.hops.length - 1);
}

function tcpEntry(
  ruleNumber: number,
  fromPort: number,
  toPort = fromPort,
  action: 'allow' | 'deny' = 'allow',
  cidrBlock = '0.0.0.0/0',
): NaclEntryInput {
  return { ruleNumber, protocol: 'tcp', fromPort, toPort, cidrBlock, action };
}

/** Associates a new custom network ACL (acl-0000000c) with `subnetId`. */
function useCustomNacl(
  inboundEntries: NaclEntryInput[],
  outboundEntries: NaclEntryInput[],
  subnetId = 'subnet-0000000a',
): Change {
  return (input) => {
    input.networkAcls.push({
      id: 'acl-0000000c',
      vpcId: 'vpc-0a1b2c3d',
      inboundEntries,
      outboundEntries,
    });
    const subnet = input.subnets.find((candidate) => candidate.id === subnetId);
    if (subnet) subnet.networkAclId = 'acl-0000000c';
  };
}

function webGroup(input: TopologyInput) {
  return at(input.securityGroups, 1);
}

function removeRoutes(input: TopologyInput) {
  at(input.routeTables, 1).routes = [];
}

function removePublicIp(input: TopologyInput) {
  delete at(input.instances, 0).primaryNetworkInterface.publicIp;
}

function detachInternetGateway(input: TopologyInput) {
  delete at(input.internetGateways, 0).attachedVpcId;
}

/** A second instance (i-0000000b, 10.0.1.11) in the base subnet with the default group. */
function addSecondInstance(input: TopologyInput) {
  input.instances.push(extraInstance('0000000b', '10.0.1.11'));
}

/** A second subnet (10.0.2.0/24) with an instance i-0000000b at 10.0.2.10. */
function addInstanceInOtherSubnet(input: TopologyInput) {
  input.subnets.push({
    id: 'subnet-0000000b',
    vpcId: 'vpc-0a1b2c3d',
    cidrBlock: '10.0.2.0/24',
    availabilityZone: 'us-east-1a',
  });
  input.instances.push(extraInstance('0000000b', '10.0.2.10', 'subnet-0000000b'));
}

/** An `app` group (sg-0000000b) and an app instance i-0000000b in it; web allows 80 only from app. */
function webAllowsOnlyApp(input: TopologyInput) {
  input.securityGroups.push({
    id: 'sg-0000000b',
    vpcId: 'vpc-0a1b2c3d',
    name: 'app',
    description: 'App servers',
    inboundRules: [],
    outboundRules: [
      { id: 'sgr-000000b2', protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
    ],
  });
  webGroup(input).inboundRules = [
    {
      id: 'sgr-000000b1',
      protocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      peer: { type: 'security-group', securityGroupId: 'sg-0000000b' },
    },
  ];
  const app = extraInstance('0000000b', '10.0.1.11');
  app.primaryNetworkInterface.securityGroupIds = ['sg-0000000b'];
  input.instances.push(app);
}

describe('trace: common mistakes in lab 1', () => {
  it('IGW-04: missing 0.0.0.0/0 route breaks the return path', () => {
    const result = traceBase(removeRoutes, f1());
    expect(result).toMatchObject({
      flow: 'F1',
      verdict: 'BROKE_AT_HOP',
      failure: { direction: 'return', hopIndex: 6, reasonCodes: ['NO_ROUTE_TO_DESTINATION'] },
    });
    expect(lastHop(result)).toMatchObject({
      step: 'route-lookup',
      component: { type: 'route-table', id: 'rtb-00000002' },
      outcome: 'fail',
      fidelity: 'Inferred',
    });
    expect(lastHop(result).match).toBeUndefined();
  });

  it('IGW-02: no public IP, inbound', () => {
    const result = traceBase(removePublicIp, f1());
    expect(result).toMatchObject({
      verdict: 'BROKE_AT_HOP',
      failure: {
        direction: 'forward',
        hopIndex: 0,
        reasonCodes: ['IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS'],
      },
    });
    expect(result.hops).toHaveLength(1);
    expect(lastHop(result)).toMatchObject({
      step: 'igw-ingress',
      component: { type: 'internet-gateway', id: 'igw-0000000a' },
      packet: { sourceIp: CLIENT_IP, destinationIp: null, destinationPort: 80 },
      outcome: 'fail',
    });
    expect(lastHop(result).translatedTo).toBeUndefined();
  });

  it('EPH-01: NACL blocks the return port', () => {
    const result = traceBase(useCustomNacl([tcpEntry(100, 80)], [tcpEntry(100, 80)]), f1());
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'return', hopIndex: 5, reasonCodes: ['SUBNET_ACL_RESTRICTION'] },
    });
    expect(lastHop(result)).toMatchObject({
      step: 'nacl-outbound',
      component: { type: 'subnet', id: 'subnet-0000000a' },
      packet: { sourceIp: '10.0.1.10', sourcePort: 80, destinationIp: CLIENT_IP },
      match: { type: 'nacl-entry', networkAclId: 'acl-0000000c', ruleNumber: '*', action: 'deny' },
    });
    expect(lastHop(result).packet.destinationPort).toBe(32768);
  });

  it('SG-02: no inbound rule for port 80', () => {
    const result = traceBase((input) => {
      webGroup(input).inboundRules = [
        {
          id: 'sgr-0000000c',
          protocol: 'tcp',
          fromPort: 22,
          toPort: 22,
          peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' },
        },
      ];
    }, f1());
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 2, reasonCodes: ['ENI_SG_RULES_MISMATCH'] },
    });
    expect(lastHop(result)).toMatchObject({
      step: 'sg-ingress',
      component: { type: 'network-interface', id: 'eni-0000000a' },
      fidelity: 'Exact',
    });
  });

  it('TRC-01: nothing listening on port 80', () => {
    const result = traceBase((input) => {
      at(input.instances, 0).runningServices = [];
    }, f1());
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 3, reasonCodes: ['NO_LISTENER'] },
    });
    expect(lastHop(result)).toMatchObject({
      step: 'host',
      component: { type: 'instance', id: 'i-0000000a' },
      fidelity: 'Inferred',
    });
  });
});

describe('trace: F1 internet → instance', () => {
  it('TRC-02: F1 reaches the web server', () => {
    const result = traceBase(noChange, f1());
    const request = {
      protocol: 'tcp',
      sourceIp: CLIENT_IP,
      sourcePort: 32768,
      destinationIp: '10.0.1.10',
      destinationPort: 80,
    } as const;
    const reply = {
      protocol: 'tcp',
      sourceIp: '10.0.1.10',
      sourcePort: 80,
      destinationIp: CLIENT_IP,
      destinationPort: 32768,
    } as const;
    expect(result).toEqual({
      status: 'evaluated',
      flow: 'F1',
      verdict: 'REACHED',
      client: { type: 'linux', portRange: { from: 32768, to: 61000 }, sourcePort: 32768 },
      fidelity: 'Inferred',
      hops: [
        {
          index: 0,
          direction: 'forward',
          step: 'igw-ingress',
          component: { type: 'internet-gateway', id: 'igw-0000000a' },
          packet: { ...request, destinationIp: '203.0.113.25' },
          translatedTo: request,
          outcome: 'pass',
          reasonCodes: [],
          ruleIds: ['IGW-02', 'IGW-03', 'IGW-05', 'RT-02'],
          fidelity: 'Inferred',
        },
        {
          index: 1,
          direction: 'forward',
          step: 'nacl-inbound',
          component: { type: 'subnet', id: 'subnet-0000000a' },
          packet: request,
          outcome: 'pass',
          match: {
            type: 'nacl-entry',
            networkAclId: 'acl-00000001',
            ruleNumber: 100,
            action: 'allow',
          },
          reasonCodes: [],
          ruleIds: ['NACL-01', 'NACL-02', 'NACL-03', 'NACL-04', 'NACL-05'],
          fidelity: 'Exact',
        },
        {
          index: 2,
          direction: 'forward',
          step: 'sg-ingress',
          component: { type: 'network-interface', id: 'eni-0000000a' },
          packet: request,
          outcome: 'pass',
          match: { type: 'sg-rule', securityGroupId: 'sg-0000000a', ruleId: 'sgr-0000000a' },
          reasonCodes: [],
          ruleIds: ['SG-02', 'SG-03', 'SG-04'],
          fidelity: 'Exact',
        },
        {
          index: 3,
          direction: 'forward',
          step: 'host',
          component: { type: 'instance', id: 'i-0000000a' },
          packet: request,
          outcome: 'pass',
          match: { type: 'service', port: 80, name: 'nginx' },
          reasonCodes: [],
          ruleIds: ['TRC-01'],
          fidelity: 'Inferred',
        },
        {
          index: 4,
          direction: 'return',
          step: 'sg-egress',
          component: { type: 'network-interface', id: 'eni-0000000a' },
          packet: reply,
          outcome: 'skipped',
          skippedBecause: 'stateful-response',
          reasonCodes: [],
          ruleIds: ['SG-01'],
          fidelity: 'Exact',
        },
        {
          index: 5,
          direction: 'return',
          step: 'nacl-outbound',
          component: { type: 'subnet', id: 'subnet-0000000a' },
          packet: reply,
          outcome: 'pass',
          match: {
            type: 'nacl-entry',
            networkAclId: 'acl-00000001',
            ruleNumber: 100,
            action: 'allow',
          },
          reasonCodes: [],
          ruleIds: ['NACL-03', 'EPH-01', 'EPH-02'],
          fidelity: 'Exact',
        },
        {
          index: 6,
          direction: 'return',
          step: 'route-lookup',
          component: { type: 'route-table', id: 'rtb-00000002' },
          packet: reply,
          outcome: 'pass',
          match: {
            type: 'route',
            routeTableId: 'rtb-00000002',
            destinationCidrBlock: '0.0.0.0/0',
            target: 'igw-0000000a',
            state: 'active',
          },
          reasonCodes: [],
          ruleIds: ['RT-02', 'RT-04', 'RT-08', 'IGW-04'],
          fidelity: 'Inferred',
        },
        {
          index: 7,
          direction: 'return',
          step: 'igw-egress',
          component: { type: 'internet-gateway', id: 'igw-0000000a' },
          packet: reply,
          translatedTo: { ...reply, sourceIp: '203.0.113.25' },
          outcome: 'pass',
          reasonCodes: [],
          ruleIds: ['IGW-01', 'IGW-03'],
          fidelity: 'Exact',
        },
      ],
    });
  });

  it('IGW-02: internet client aims at the private address', () => {
    const result = traceBase(
      noChange,
      f1(80, {
        destination: { type: 'instance', instanceId: 'i-0000000a', address: 'private' },
      }),
    );
    expect(result).toMatchObject({
      verdict: 'BROKE_AT_HOP',
      failure: {
        direction: 'forward',
        hopIndex: 0,
        reasonCodes: ['IGW_PRIVATE_IP_ASSOCIATION_FOR_INGRESS'],
      },
    });
    expect(lastHop(result).packet.destinationIp).toBe('10.0.1.10');
  });

  it('IGW-05: no attached internet gateway for inbound traffic', () => {
    const result = traceBase(detachInternetGateway, f1());
    expect(result).toMatchObject({
      verdict: 'BROKE_AT_HOP',
      failure: { direction: 'forward', hopIndex: 0, reasonCodes: ['NO_INTERNET_GATEWAY'] },
      fidelity: 'Inferred',
    });
    expect(lastHop(result).component).toEqual({ type: 'vpc', id: 'vpc-0a1b2c3d' });
  });

  it('EPH-03: NACL allows 1024-65535 outbound', () => {
    const nacl = useCustomNacl(
      [tcpEntry(100, 80)],
      [tcpEntry(100, 80), tcpEntry(110, 1024, 65535)],
    );
    expect(traceBase(nacl, f1()).verdict).toBe('REACHED');
    const windows = f1(80, { clientType: 'windows', sourcePort: 65000 });
    expect(traceBase(nacl, windows).verdict).toBe('REACHED');
  });

  it('EPH-02: windows client port outside the allowed range', () => {
    const nacl = useCustomNacl(
      [tcpEntry(100, 80)],
      [tcpEntry(100, 80), tcpEntry(110, 32768, 61000)],
    );
    const result = traceBase(nacl, f1(80, { clientType: 'windows', sourcePort: 65000 }));
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'return', hopIndex: 5, reasonCodes: ['SUBNET_ACL_RESTRICTION'] },
      client: { type: 'windows', portRange: { from: 49152, to: 65535 }, sourcePort: 65000 },
    });
    expect(lastHop(result).packet.destinationPort).toBe(65000);
  });

  it('EPH-02: the default source port is the first port of the client range', () => {
    const result = traceBase(noChange, f1(80, { clientType: 'windows' }));
    expect(result.client).toEqual({
      type: 'windows',
      portRange: { from: 49152, to: 65535 },
      sourcePort: 49152,
    });
    expect(at(result.hops, 0).packet.sourcePort).toBe(49152);
  });

  it('NACL-02: lower deny wins', () => {
    const result = traceBase((input) => {
      at(input.networkAcls, 0).inboundEntries.unshift(
        tcpEntry(90, 80, 80, 'deny', '198.51.100.0/24'),
      );
    }, f1());
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 1, reasonCodes: ['SUBNET_ACL_RESTRICTION'] },
    });
    expect(lastHop(result).match).toEqual({
      type: 'nacl-entry',
      networkAclId: 'acl-00000001',
      ruleNumber: 90,
      action: 'deny',
    });
  });

  it('NACL-02: entries are checked by rule number, not by array order', () => {
    const result = traceBase((input) => {
      at(input.networkAcls, 0).inboundEntries.push(tcpEntry(90, 80, 80, 'deny'));
    }, f1());
    expect(lastHop(result)).toMatchObject({ step: 'nacl-inbound', match: { ruleNumber: 90 } });
  });

  it('SG-02: group with no inbound rules', () => {
    const result = traceBase((input) => {
      webGroup(input).inboundRules = [];
    }, f1());
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 2, reasonCodes: ['SG_HAS_NO_RULES'] },
    });
    // The SG_HAS_NO_RULES mapping is Inferred (SG-02).
    expect(lastHop(result).fidelity).toBe('Inferred');
  });

  it('SG-03: rules of every group on the interface are aggregated', () => {
    const result = traceBase((input) => {
      webGroup(input).inboundRules = [];
      at(input.instances, 0).primaryNetworkInterface.securityGroupIds = [
        'sg-0000000a',
        'sg-00000001',
      ];
      at(input.securityGroups, 0).inboundRules.push({
        id: 'sgr-0000000c',
        protocol: 'tcp',
        fromPort: 80,
        toPort: 80,
        peer: { type: 'cidr', cidrBlock: '198.51.100.0/24' },
      });
    }, f1());
    expect(result.verdict).toBe('REACHED');
    expect(at(result.hops, 2).match).toEqual({
      type: 'sg-rule',
      securityGroupId: 'sg-00000001',
      ruleId: 'sgr-0000000c',
    });
  });

  it('SG-01: responses skip the security group', () => {
    const result = traceBase((input) => {
      webGroup(input).outboundRules = [];
    }, f1());
    expect(result.verdict).toBe('REACHED');
    expect(at(result.hops, 4)).toMatchObject({
      step: 'sg-egress',
      outcome: 'skipped',
      skippedBecause: 'stateful-response',
    });
  });

  it('SG-04: security group reference never matches internet traffic', () => {
    const result = traceBase(webAllowsOnlyApp, f1());
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 2, reasonCodes: ['ENI_SG_RULES_MISMATCH'] },
    });
  });
});

describe('trace: F2 instance → internet', () => {
  it('TRC-02: F2 reaches the internet', () => {
    const result = traceBase(noChange, f2());
    expect(result).toMatchObject({
      flow: 'F2',
      verdict: 'REACHED',
      client: { type: 'linux', portRange: { from: 32768, to: 61000 }, sourcePort: 32768 },
      fidelity: 'Inferred',
    });
    expect(result.failure).toBeUndefined();
    expect(result.hops.map((hop) => [hop.index, hop.direction, hop.step, hop.outcome])).toEqual([
      [0, 'forward', 'sg-egress', 'pass'],
      [1, 'forward', 'nacl-outbound', 'pass'],
      [2, 'forward', 'route-lookup', 'pass'],
      [3, 'forward', 'igw-egress', 'pass'],
      [4, 'return', 'igw-ingress', 'pass'],
      [5, 'return', 'nacl-inbound', 'pass'],
      [6, 'return', 'sg-ingress', 'skipped'],
    ]);
    expect(at(result.hops, 3)).toMatchObject({
      packet: { sourceIp: '10.0.1.10', sourcePort: 32768, destinationIp: CLIENT_IP },
      translatedTo: { sourceIp: '203.0.113.25', destinationIp: CLIENT_IP },
    });
    expect(at(result.hops, 4)).toMatchObject({
      packet: { sourceIp: CLIENT_IP, sourcePort: 443, destinationIp: '203.0.113.25' },
      translatedTo: { destinationIp: '10.0.1.10', destinationPort: 32768 },
      fidelity: 'Inferred',
    });
  });

  it('EPH-01: an instance client uses the port range of its platform', () => {
    const result = traceBase((input) => {
      at(input.instances, 0).platform = 'windows';
    }, f2());
    expect(result.client).toEqual({
      type: 'windows',
      portRange: { from: 49152, to: 65535 },
      sourcePort: 49152,
    });
  });

  it('RT-01: subnet on the main table has no internet route', () => {
    const result = traceBase((input) => {
      delete at(input.subnets, 0).routeTableId;
    }, f2());
    expect(result).toMatchObject({
      verdict: 'BROKE_AT_HOP',
      failure: { direction: 'forward', hopIndex: 2, reasonCodes: ['NO_ROUTE_TO_DESTINATION'] },
    });
    expect(lastHop(result).component).toEqual({ type: 'route-table', id: 'rtb-00000001' });
  });

  it('IGW-01: no public IP, outbound', () => {
    const result = traceBase(removePublicIp, f2());
    expect(result).toMatchObject({
      verdict: 'BROKE_AT_HOP',
      failure: {
        direction: 'forward',
        hopIndex: 3,
        reasonCodes: ['IGW_PUBLIC_IP_ASSOCIATION_FOR_EGRESS'],
      },
    });
  });

  it('RT-08: detached internet gateway is a blackhole', () => {
    const result = traceBase(detachInternetGateway, f2());
    expect(result).toMatchObject({
      verdict: 'BROKE_AT_HOP',
      failure: { direction: 'forward', hopIndex: 2, reasonCodes: ['BAD_STATE_ROUTE'] },
    });
    expect(lastHop(result)).toMatchObject({
      match: { type: 'route', target: 'igw-0000000a', state: 'blackhole' },
      fidelity: 'Exact',
    });
  });

  it('NACL-03: inbound return traffic needs its own rule', () => {
    const nacl = useCustomNacl(
      [tcpEntry(100, 80)],
      [{ ruleNumber: 100, protocol: 'all', cidrBlock: '0.0.0.0/0', action: 'allow' }],
    );
    const result = traceBase(nacl, f2());
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'return', hopIndex: 5, reasonCodes: ['SUBNET_ACL_RESTRICTION'] },
    });
    expect(lastHop(result)).toMatchObject({
      step: 'nacl-inbound',
      packet: { destinationPort: 32768 },
      match: { ruleNumber: '*', action: 'deny' },
    });
  });

  it('SG-02: no outbound rules blocks new connections', () => {
    const result = traceBase((input) => {
      webGroup(input).outboundRules = [];
    }, f2());
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 0, reasonCodes: ['SG_HAS_NO_RULES'] },
    });
  });

  it('RT-04: longest prefix wins', () => {
    const change: Change = (input) => {
      input.internetGateways.push({ id: 'igw-0000000b' });
      at(input.routeTables, 1).routes.push({
        destinationCidrBlock: '198.51.100.0/24',
        target: { type: 'internet-gateway', internetGatewayId: 'igw-0000000b' },
      });
    };
    const blackholed = traceBase(change, f2('198.51.100.7'));
    expect(blackholed).toMatchObject({
      verdict: 'BROKE_AT_HOP',
      failure: { direction: 'forward', hopIndex: 2, reasonCodes: ['BAD_STATE_ROUTE'] },
      fidelity: 'Inferred',
    });
    expect(lastHop(blackholed)).toMatchObject({
      match: { destinationCidrBlock: '198.51.100.0/24', target: 'igw-0000000b' },
      // The blackhole route shadows the active 0.0.0.0/0 route: Inferred (Q8).
      fidelity: 'Inferred',
    });

    const reached = traceBase(change, f2('203.0.113.99'));
    expect(reached.verdict).toBe('REACHED');
    expect(at(reached.hops, 2).match).toMatchObject({ destinationCidrBlock: '0.0.0.0/0' });
  });
});

describe('trace: F0 instance → instance', () => {
  it('NACL-04: same-subnet traffic skips the NACL', () => {
    const change: Change = (input) => {
      addSecondInstance(input);
      useCustomNacl([], [])(input);
    };
    const result = traceBase(change, f0('i-0000000b', 'i-0000000a'));
    expect(result).toMatchObject({ flow: 'F0', verdict: 'REACHED', fidelity: 'Inferred' });
    expect(
      result.hops.map((hop) => [
        hop.index,
        hop.direction,
        hop.step,
        hop.outcome,
        hop.skippedBecause,
      ]),
    ).toEqual([
      [0, 'forward', 'sg-egress', 'pass', undefined],
      [1, 'forward', 'nacl-outbound', 'skipped', 'same-subnet'],
      [2, 'forward', 'route-lookup', 'pass', undefined],
      [3, 'forward', 'nacl-inbound', 'skipped', 'same-subnet'],
      [4, 'forward', 'sg-ingress', 'pass', undefined],
      [5, 'forward', 'host', 'pass', undefined],
      [6, 'return', 'sg-egress', 'skipped', 'stateful-response'],
      [7, 'return', 'nacl-outbound', 'skipped', 'same-subnet'],
      [8, 'return', 'route-lookup', 'pass', undefined],
      [9, 'return', 'nacl-inbound', 'skipped', 'same-subnet'],
      [10, 'return', 'sg-ingress', 'skipped', 'stateful-response'],
    ]);
    expect(at(result.hops, 2).match).toEqual({
      type: 'route',
      routeTableId: 'rtb-00000002',
      destinationCidrBlock: '10.0.0.0/16',
      target: 'local',
      state: 'active',
    });
    expect(at(result.hops, 0).packet).toEqual({
      protocol: 'tcp',
      sourceIp: '10.0.1.11',
      sourcePort: 32768,
      destinationIp: '10.0.1.10',
      destinationPort: 80,
    });
  });

  it('NACL-04: cross-subnet traffic is checked', () => {
    const change: Change = (input) => {
      addInstanceInOtherSubnet(input);
      useCustomNacl([], [], 'subnet-0000000b')(input);
    };
    const result = traceBase(change, f0('i-0000000b', 'i-0000000a'));
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 1, reasonCodes: ['SUBNET_ACL_RESTRICTION'] },
    });
    expect(lastHop(result)).toMatchObject({
      step: 'nacl-outbound',
      component: { type: 'subnet', id: 'subnet-0000000b' },
      match: { networkAclId: 'acl-0000000c', ruleNumber: '*' },
    });
  });

  it('NACL-04: cross-subnet traffic passes both NACLs in both directions', () => {
    const result = traceBase(addInstanceInOtherSubnet, f0('i-0000000b', 'i-0000000a'));
    expect(result.verdict).toBe('REACHED');
    expect(result.hops.filter((hop) => hop.step.startsWith('nacl'))).toHaveLength(4);
    expect(result.hops.every((hop) => hop.skippedBecause !== 'same-subnet')).toBe(true);
    expect(at(result.hops, 8).component).toEqual({ type: 'route-table', id: 'rtb-00000002' });
    expect(at(result.hops, 2).component).toEqual({ type: 'route-table', id: 'rtb-00000001' });
  });

  it('SG-04: security group reference matches private traffic', () => {
    const result = traceBase(webAllowsOnlyApp, f0('i-0000000b', 'i-0000000a'));
    expect(result.verdict).toBe('REACHED');
    expect(at(result.hops, 4).match).toEqual({
      type: 'sg-rule',
      securityGroupId: 'sg-0000000a',
      ruleId: 'sgr-000000b1',
    });
  });

  it('SG-04: a reference does not match an instance outside the group', () => {
    const change: Change = (input) => {
      webAllowsOnlyApp(input);
      input.instances.push(extraInstance('0000000c', '10.0.1.12'));
    };
    const result = traceBase(change, f0('i-0000000c', 'i-0000000a'));
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 4, reasonCodes: ['ENI_SG_RULES_MISMATCH'] },
    });
  });

  it('TRC-01: F0 to a port with no listener', () => {
    // web-1 joins the default group, whose inbound rule allows all traffic from itself.
    const result = traceBase(
      (input) => {
        addSecondInstance(input);
        at(input.instances, 0).primaryNetworkInterface.securityGroupIds = [
          'sg-0000000a',
          'sg-00000001',
        ];
      },
      f0('i-0000000a', 'i-0000000b', 22),
    );
    expect(result).toMatchObject({
      verdict: 'ROUTED_THEN_DROPPED',
      failure: { direction: 'forward', hopIndex: 5, reasonCodes: ['NO_LISTENER'] },
    });
    expect(at(result.hops, 4).match).toEqual({
      type: 'sg-rule',
      securityGroupId: 'sg-00000001',
      ruleId: 'sgr-00000001',
    });
  });
});

describe('trace: blocked queries', () => {
  it('IGW-06: private internet address is rejected', () => {
    expect(trace(parseBase(), f2('10.1.0.5'))).toEqual({
      status: 'blocked',
      issues: [
        {
          code: 'IGW_EXPECTS_PUBLIC_ADDRESS',
          severity: 'error',
          ruleIds: ['IGW-06'],
          fidelity: 'Exact',
          path: ['query', 'destination', 'ipAddress'],
          params: { ipAddress: '10.1.0.5', reason: 'rfc1918', range: '10.0.0.0/8' },
        },
      ],
    });
    for (const address of ['100.64.0.1', '127.0.0.1', '169.254.169.254']) {
      const result = trace(parseBase(), f2(address));
      expect(result, address).toMatchObject({
        status: 'blocked',
        issues: [{ code: 'IGW_EXPECTS_PUBLIC_ADDRESS' }],
      });
    }
    const source = trace(
      parseBase(),
      f1(80, { source: { type: 'internet', ipAddress: '192.168.1.5' } }),
    );
    expect(source).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'IGW_EXPECTS_PUBLIC_ADDRESS', path: ['query', 'source', 'ipAddress'] }],
    });
  });

  it('TRC-04: instances in different VPCs', () => {
    const topology = parseBase((input) => {
      addOtherVpc(input);
      const other = extraInstance('0000000b', '10.1.1.10', 'subnet-0000000b');
      other.primaryNetworkInterface.securityGroupIds = ['sg-0000000b'];
      input.instances.push(other);
    });
    expect(trace(topology, f0('i-0000000a', 'i-0000000b'))).toEqual({
      status: 'blocked',
      issues: [
        {
          code: 'DISCONNECTED_VPCS',
          severity: 'error',
          ruleIds: ['TRC-04'],
          fidelity: 'Exact',
          path: ['query', 'destination', 'instanceId'],
          related: [
            { type: 'instance', id: 'i-0000000a' },
            { type: 'instance', id: 'i-0000000b' },
          ],
          params: { vpcId: 'vpc-0a1b2c3d', otherVpcId: 'vpc-0000000b' },
        },
      ],
    });
  });

  it('IGW-06: hairpin through the internet gateway is unsupported', () => {
    const topology = parseBase((input) => {
      const other = extraInstance('0000000b', '10.0.1.11');
      other.primaryNetworkInterface.publicIp = { kind: 'elastic-ip', address: '203.0.113.30' };
      input.instances.push(other);
    });
    const toPublic: TraceQuery = {
      ...f0('i-0000000a', 'i-0000000b'),
      destination: { type: 'instance', instanceId: 'i-0000000b', address: 'public' },
    };
    expect(trace(topology, toPublic)).toEqual({
      status: 'blocked',
      issues: [
        {
          code: 'UNSUPPORTED_FEATURE',
          severity: 'error',
          ruleIds: ['IGW-06'],
          fidelity: 'Unsupported',
          path: ['query', 'destination', 'address'],
          related: [{ type: 'instance', id: 'i-0000000b' }],
          params: { feature: 'igw-hairpin' },
        },
      ],
    });
    expect(trace(topology, f2('203.0.113.30'))).toMatchObject({
      status: 'blocked',
      issues: [
        {
          code: 'UNSUPPORTED_FEATURE',
          path: ['query', 'destination', 'ipAddress'],
          related: [{ type: 'instance', id: 'i-0000000b' }],
        },
      ],
    });
  });

  it('TRC-03: unknown instances, internet to internet and an instance to itself are rejected', () => {
    expect(trace(parseBase(), f0('i-0000000a', 'i-0000000f'))).toEqual({
      status: 'blocked',
      issues: [
        {
          code: 'UNKNOWN_REFERENCE',
          severity: 'error',
          ruleIds: [],
          fidelity: 'Exact',
          path: ['query', 'destination', 'instanceId'],
          params: { referenceType: 'instance', id: 'i-0000000f' },
        },
      ],
    });
    const internetToInternet: TraceQuery = {
      ...f2(),
      source: { type: 'internet', ipAddress: '203.0.113.99' },
    };
    expect(trace(parseBase(), internetToInternet)).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'INVALID_QUERY', params: { reason: 'internet-to-internet' } }],
    });
    expect(trace(parseBase(), f0('i-0000000a', 'i-0000000a'))).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'INVALID_QUERY', params: { reason: 'same-endpoint' } }],
    });
    expect(trace(parseBase(), f2(CLIENT_IP, 0))).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'INVALID_QUERY', path: ['query', 'destinationPort'] }],
    });
    expect(trace(parseBase(), f2('203.0.113'))).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'INVALID_QUERY', params: { reason: 'invalid-ip-address' } }],
    });
  });

  it('EPH-02: a custom client needs a source port; ports outside the client range are rejected', () => {
    expect(trace(parseBase(), f1(80, { clientType: 'custom' }))).toEqual({
      status: 'blocked',
      issues: [
        {
          code: 'INVALID_QUERY',
          severity: 'error',
          ruleIds: ['EPH-02'],
          fidelity: 'Exact',
          path: ['query', 'sourcePort'],
          params: { reason: 'source-port-required', clientType: 'custom' },
        },
      ],
    });
    expect(trace(parseBase(), f1(80, { sourcePort: 1024 }))).toEqual({
      status: 'blocked',
      issues: [
        {
          code: 'INVALID_QUERY',
          severity: 'error',
          ruleIds: ['EPH-02'],
          fidelity: 'Exact',
          path: ['query', 'sourcePort'],
          params: {
            reason: 'source-port-out-of-range',
            clientType: 'linux',
            sourcePort: 1024,
            from: 32768,
            to: 61000,
          },
        },
      ],
    });
    const custom = traceBase(noChange, f1(80, { clientType: 'custom', sourcePort: 5000 }));
    expect(custom.client).toEqual({
      type: 'custom',
      portRange: { from: 1, to: 65535 },
      sourcePort: 5000,
    });
  });
});

describe('trace: determinism', () => {
  it('TRC-05: same input, same result', () => {
    const topology = parseBase((input) => {
      addInstanceInOtherSubnet(input);
      useCustomNacl([tcpEntry(100, 80)], [tcpEntry(100, 80)], 'subnet-0000000b')(input);
    });
    const snapshot = JSON.stringify(topology);
    const queries = [f1(), f2(), f0('i-0000000b', 'i-0000000a'), f0('i-0000000a', 'i-0000000b')];
    for (const query of queries) {
      const first = trace(topology, query);
      expect(trace(topology, query)).toEqual(first);
      const result = evaluated(first);
      expect(result.hops.map((hop) => hop.index)).toEqual(result.hops.map((_, i) => i));
      if (result.failure) {
        expect(result.failure.hopIndex).toBe(result.hops.length - 1);
        expect(lastHop(result).outcome).toBe('fail');
        expect(lastHop(result).reasonCodes).toEqual(result.failure.reasonCodes);
      }
    }
    expect(JSON.stringify(topology)).toBe(snapshot);
  });

  it('TRC-05: invalid topology blocks the trace', () => {
    const topology = parseBase((input) => {
      input.subnets.push({
        id: 'subnet-0000000b',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.1.128/25',
        availabilityZone: 'us-east-1a',
      });
    });
    expect(trace(topology, f1())).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'CIDR_OVERLAP', resource: { type: 'subnet', id: 'subnet-0000000b' } }],
    });
  });

  it('TRC-05: warnings do not block the trace', () => {
    const result = traceBase((input) => {
      at(input.networkAcls, 0).inboundEntries = Array.from({ length: 21 }, (_, i) => ({
        ruleNumber: 100 + i,
        protocol: 'all',
        cidrBlock: '0.0.0.0/0',
        action: 'allow',
      }));
    }, f1());
    expect(result.verdict).toBe('REACHED');
  });
});
