import { describe, expect, it } from 'vitest';
import {
  associateNetworkAcl,
  associateRouteTable,
  attachInternetGateway,
  createInternetGateway,
  createNetworkAcl,
  deriveStatus,
  detachInternetGateway,
  disassociateRouteTable,
  newErrors,
  replaceNetworkAclEntries,
  replaceRoutes,
  replaceSecurityGroupRules,
  setMainRouteTable,
  setMapPublicIpOnLaunch,
  setNameTag,
  type HelperResult,
  type Topology,
} from '../src/index';
import { parseBase } from './fixtures/base';

const VPC = 'vpc-0a1b2c3d';
const SUBNET = 'subnet-0000000a';
const MAIN_RTB = 'rtb-00000001';
const PUBLIC_RTB = 'rtb-00000002';
const IGW = 'igw-0000000a';
const DEFAULT_ACL = 'acl-00000001';
const WEB_SG = 'sg-0000000a';

function ok<T>(result: HelperResult<T>): { topology: Topology; created: T } {
  if (!result.ok) throw new Error(`Helper failed: ${result.error.code}`);
  return result;
}

function errorOf<T>(result: HelperResult<T>) {
  if (result.ok) throw new Error('Expected the helper to fail');
  return result.error;
}

describe('route tables', () => {
  it('RT-01: disassociating returns the subnet to the main route table', () => {
    const { topology } = ok(disassociateRouteTable(parseBase(), SUBNET));
    expect(topology.subnets[0]).not.toHaveProperty('routeTableId');
    expect(deriveStatus(topology).subnets[SUBNET]).toMatchObject({
      routeTableId: MAIN_RTB,
      routeTableAssociation: 'main',
    });
  });

  it('RT-01: associating a subnet with the main route table makes the association explicit', () => {
    const { topology } = ok(associateRouteTable(parseBase(), SUBNET, MAIN_RTB));
    expect(topology.subnets[0]?.routeTableId).toBe(MAIN_RTB);
    expect(deriveStatus(topology).subnets[SUBNET]).toMatchObject({
      routeTableId: MAIN_RTB,
      routeTableAssociation: 'explicit',
    });
  });

  it('RT-01: set main route table changes the VPC main table and keeps explicit associations', () => {
    const { topology } = ok(setMainRouteTable(parseBase(), PUBLIC_RTB));
    expect(topology.vpcs[0]?.mainRouteTableId).toBe(PUBLIC_RTB);
    expect(topology.subnets[0]?.routeTableId).toBe(PUBLIC_RTB);
    const status = deriveStatus(topology);
    expect(status.routeTables[PUBLIC_RTB]?.main).toBe(true);
    expect(status.routeTables[MAIN_RTB]?.main).toBe(false);
  });

  it('RT-03: replace routes stores only the given routes, in canonical form', () => {
    const { topology } = ok(
      replaceRoutes(parseBase(), PUBLIC_RTB, [
        {
          destinationCidrBlock: '198.51.100.7/24',
          target: { type: 'internet-gateway', internetGatewayId: IGW },
        },
      ]),
    );
    expect(topology.routeTables[1]?.routes).toEqual([
      {
        destinationCidrBlock: '198.51.100.0/24',
        target: { type: 'internet-gateway', internetGatewayId: IGW },
      },
    ]);
  });

  it('RT-03: a stored route inside the VPC CIDR is a new error', () => {
    const before = parseBase();
    const { topology } = ok(
      replaceRoutes(before, PUBLIC_RTB, [
        {
          destinationCidrBlock: '10.0.5.0/24',
          target: { type: 'internet-gateway', internetGatewayId: IGW },
        },
      ]),
    );
    expect(newErrors(before, topology).map((issue) => issue.code)).toEqual([
      'LOCAL_ROUTE_CONFLICT',
    ]);
  });
});

describe('internet gateways', () => {
  it('IGW-05: attach rejects a gateway that is already attached', () => {
    expect(errorOf(attachInternetGateway(parseBase(), IGW, VPC))).toEqual({
      code: 'IGW_ALREADY_ATTACHED',
      ruleIds: ['IGW-05'],
      params: { internetGatewayId: IGW, vpcId: VPC },
    });
  });

  it('IGW-05: attach rejects a second gateway for one VPC', () => {
    const { topology, created } = ok(createInternetGateway(parseBase(), {}));
    expect(errorOf(attachInternetGateway(topology, created.internetGatewayId, VPC))).toEqual({
      code: 'VPC_ALREADY_HAS_IGW',
      ruleIds: ['IGW-05'],
      params: { vpcId: VPC, internetGatewayId: IGW },
    });
  });

  it('IGW-07: detach rejects while an interface in the VPC has a public address', () => {
    expect(errorOf(detachInternetGateway(parseBase(), IGW))).toEqual({
      code: 'IGW_HAS_PUBLIC_ADDRESSES',
      ruleIds: ['IGW-07'],
      params: { internetGatewayId: IGW, vpcId: VPC, count: 1 },
    });
  });

  it('IGW-07: detach works when no interface in the VPC has a public address', () => {
    const before = parseBase((input) => {
      const eni = input.instances[0]?.primaryNetworkInterface;
      if (eni) delete eni.publicIp;
    });
    const { topology } = ok(detachInternetGateway(before, IGW));
    expect(topology.internetGateways[0]).not.toHaveProperty('attachedVpcId');
    expect(deriveStatus(topology).internetGateways[IGW]).toEqual({ state: 'detached' });
    const reattached = ok(attachInternetGateway(topology, IGW, VPC)).topology;
    expect(reattached.internetGateways[0]?.attachedVpcId).toBe(VPC);
  });

  it('IGW-07: detaching a detached gateway gives IGW_NOT_ATTACHED', () => {
    const { topology, created } = ok(createInternetGateway(parseBase(), {}));
    expect(errorOf(detachInternetGateway(topology, created.internetGatewayId))).toEqual({
      code: 'IGW_NOT_ATTACHED',
      ruleIds: ['IGW-07'],
      params: { internetGatewayId: created.internetGatewayId },
    });
  });
});

describe('security groups', () => {
  it('SG-04: replacing rules keeps known rule IDs and gives new rules new IDs', () => {
    const { topology } = ok(
      replaceSecurityGroupRules(parseBase(), WEB_SG, 'inbound', [
        {
          id: 'sgr-0000000a',
          protocol: 'tcp',
          fromPort: 80,
          toPort: 80,
          peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' },
        },
        {
          protocol: 'tcp',
          fromPort: 443,
          toPort: 443,
          peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' },
        },
        // A rule ID of another group (or direction) is not reused.
        {
          id: 'sgr-00000001',
          protocol: 'tcp',
          fromPort: 22,
          toPort: 22,
          peer: { type: 'cidr', cidrBlock: '203.0.113.0/24' },
        },
      ]),
    );
    const group = topology.securityGroups[1];
    expect(group?.inboundRules.map((rule) => rule.id)).toEqual([
      'sgr-0000000a',
      'sgr-0000000c',
      'sgr-0000000d',
    ]);
    expect(group?.outboundRules).toEqual(parseBase().securityGroups[1]?.outboundRules);
    expect(topology.securityGroups[0]).toEqual(parseBase().securityGroups[0]);
  });

  it('SG-02: an empty list removes every rule of that direction', () => {
    const { topology } = ok(replaceSecurityGroupRules(parseBase(), WEB_SG, 'outbound', []));
    expect(topology.securityGroups[1]?.outboundRules).toEqual([]);
  });
});

describe('network ACLs', () => {
  it('NACL-02: replace entries stores the numbered entries of one direction', () => {
    const entries = [
      {
        ruleNumber: 100,
        protocol: 'tcp',
        fromPort: 80,
        toPort: 80,
        cidrBlock: '0.0.0.0/0',
        action: 'allow',
      },
    ] as const;
    const { topology } = ok(
      replaceNetworkAclEntries(parseBase(), DEFAULT_ACL, 'inbound', [...entries]),
    );
    expect(topology.networkAcls[0]?.inboundEntries).toEqual(entries);
    expect(topology.networkAcls[0]?.outboundEntries).toEqual(
      parseBase().networkAcls[0]?.outboundEntries,
    );
  });

  it('NACL-08: a repeated rule number is a new error', () => {
    const before = parseBase();
    const { topology } = ok(
      replaceNetworkAclEntries(before, DEFAULT_ACL, 'outbound', [
        { ruleNumber: 100, protocol: 'all', cidrBlock: '0.0.0.0/0', action: 'allow' },
        { ruleNumber: 100, protocol: 'all', cidrBlock: '10.0.0.0/8', action: 'deny' },
      ]),
    );
    expect(newErrors(before, topology).map((issue) => issue.code)).toEqual([
      'NACL_RULE_NUMBER_DUPLICATE',
    ]);
  });

  it('NACL-01: a custom ACL association is explicit; choosing the default ACL clears it', () => {
    const custom = ok(createNetworkAcl(parseBase(), { vpcId: VPC }));
    const associated = ok(
      associateNetworkAcl(custom.topology, SUBNET, custom.created.networkAclId),
    ).topology;
    expect(deriveStatus(associated).subnets[SUBNET]).toMatchObject({
      networkAclId: custom.created.networkAclId,
      networkAclAssociation: 'explicit',
    });
    const back = ok(associateNetworkAcl(associated, SUBNET, DEFAULT_ACL)).topology;
    expect(back.subnets[0]).not.toHaveProperty('networkAclId');
    expect(deriveStatus(back).subnets[SUBNET]).toMatchObject({
      networkAclId: DEFAULT_ACL,
      networkAclAssociation: 'default',
    });
  });
});

describe('subnet settings and Name tags', () => {
  it('ADR-10: edit subnet settings changes only the subnet attribute', () => {
    const before = parseBase();
    const { topology } = ok(setMapPublicIpOnLaunch(before, SUBNET, false));
    expect(topology.subnets[0]?.mapPublicIpOnLaunch).toBe(false);
    expect(topology.instances).toEqual(before.instances);
  });

  it('HELPERS: a Name tag is set, and an empty name removes it', () => {
    const named = ok(
      setNameTag(parseBase(), { type: 'route-table', id: MAIN_RTB }, 'main'),
    ).topology;
    expect(named.routeTables[0]?.name).toBe('main');
    const cleared = ok(setNameTag(named, { type: 'subnet', id: SUBNET }, '')).topology;
    expect(cleared.subnets[0]).not.toHaveProperty('name');
  });

  it('HELPERS: edit helpers give UNKNOWN_REFERENCE for IDs that do not exist', () => {
    const base = parseBase();
    const calls: [HelperResult<unknown>, string, string][] = [
      [associateRouteTable(base, 'subnet-0000ffff', MAIN_RTB), 'subnet', 'subnet-0000ffff'],
      [associateRouteTable(base, SUBNET, 'rtb-0000ffff'), 'route-table', 'rtb-0000ffff'],
      [disassociateRouteTable(base, 'subnet-0000ffff'), 'subnet', 'subnet-0000ffff'],
      [setMainRouteTable(base, 'rtb-0000ffff'), 'route-table', 'rtb-0000ffff'],
      [replaceRoutes(base, 'rtb-0000ffff', []), 'route-table', 'rtb-0000ffff'],
      [attachInternetGateway(base, 'igw-0000ffff', VPC), 'internet-gateway', 'igw-0000ffff'],
      [attachInternetGateway(base, IGW, 'vpc-0000ffff'), 'vpc', 'vpc-0000ffff'],
      [detachInternetGateway(base, 'igw-0000ffff'), 'internet-gateway', 'igw-0000ffff'],
      [
        replaceSecurityGroupRules(base, 'sg-0000ffff', 'inbound', []),
        'security-group',
        'sg-0000ffff',
      ],
      [
        replaceNetworkAclEntries(base, 'acl-0000ffff', 'inbound', []),
        'network-acl',
        'acl-0000ffff',
      ],
      [associateNetworkAcl(base, SUBNET, 'acl-0000ffff'), 'network-acl', 'acl-0000ffff'],
      [setMapPublicIpOnLaunch(base, 'subnet-0000ffff', true), 'subnet', 'subnet-0000ffff'],
      [setNameTag(base, { type: 'instance', id: 'i-0000ffff' }, 'x'), 'instance', 'i-0000ffff'],
    ];
    for (const [result, referenceType, id] of calls) {
      expect(errorOf(result)).toEqual({
        code: 'UNKNOWN_REFERENCE',
        ruleIds: [],
        params: { referenceType, id },
      });
    }
  });
});
