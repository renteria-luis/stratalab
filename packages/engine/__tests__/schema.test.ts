import { describe, expect, it } from 'vitest';
import { topologySchema, type TopologyInput } from '../src/index';
import { baseInput, extraInstance } from './fixtures/base';

interface Issue {
  code: string;
  path: PropertyKey[];
  params?: Record<string, unknown>;
}

/** Parses a changed copy of the base input and returns the schema issues (empty when valid). */
function issuesFor(change: (input: TopologyInput) => void): Issue[] {
  const input = baseInput();
  change(input);
  const result = topologySchema.safeParse(input);
  return result.success ? [] : result.error.issues;
}

/** Structural codes added by the topology refinement (docs/specs/r0-engine.md section 2). */
function structuralCodes(issues: Issue[]): unknown[] {
  return issues.filter((issue) => issue.code === 'custom').map((issue) => issue.params?.code);
}

/** Loosely typed view of the input, for writing deliberately invalid values. */
function loose(input: TopologyInput): Record<string, Record<string, unknown>[]> {
  return input as unknown as Record<string, Record<string, unknown>[]>;
}

describe('topology schema', () => {
  it('SCHEMA: the lab 1 example from the spec parses', () => {
    expect(topologySchema.safeParse(baseInput()).success).toBe(true);
  });

  it('ADR-05: a non-canonical CIDR is stored in canonical form', () => {
    const input = baseInput();
    const subnet = input.subnets[0];
    if (!subnet) throw new Error('fixture');
    subnet.cidrBlock = '10.0.1.7/24';
    const route = input.routeTables[1]?.routes[0];
    if (!route) throw new Error('fixture');
    route.destinationCidrBlock = '0.0.0.5/0';
    const topology = topologySchema.parse(input);
    expect(topology.subnets[0]?.cidrBlock).toBe('10.0.1.0/24');
    expect(topology.routeTables[1]?.routes[0]?.destinationCidrBlock).toBe('0.0.0.0/0');
  });

  it('ADR-05: an invalid IPv4 address or CIDR is a schema error', () => {
    expect(
      issuesFor((input) => {
        const eni = input.instances[0]?.primaryNetworkInterface;
        if (eni) eni.privateIpAddress = '10.0.1.256';
      }).map((issue) => issue.path),
    ).toEqual([['instances', 0, 'primaryNetworkInterface', 'privateIpAddress']]);
    expect(
      issuesFor((input) => {
        const vpc = input.vpcs[0];
        if (vpc) vpc.cidrBlock = '10.0.0.0/33';
      }).map((issue) => issue.path),
    ).toEqual([['vpcs', 0, 'cidrBlock']]);
  });

  it('ADR-10: mapPublicIpOnLaunch defaults to false', () => {
    const input = baseInput();
    const subnet = input.subnets[0];
    if (!subnet) throw new Error('fixture');
    delete subnet.mapPublicIpOnLaunch;
    expect(topologySchema.parse(input).subnets[0]?.mapPublicIpOnLaunch).toBe(false);
  });

  it('RT-03: a stored route with target local is a schema error', () => {
    const issues = issuesFor((input) => {
      const routes = loose(input).routeTables?.[1]?.routes as Record<string, unknown>[];
      routes.push({ destinationCidrBlock: '10.0.0.0/16', target: { type: 'local' } });
    });
    expect(issues.map((issue) => issue.path)).toEqual([
      ['routeTables', 1, 'routes', 1, 'target', 'type'],
    ]);
  });

  it('NACL-02: rule number 0, 32767 or "*" is a schema error', () => {
    for (const ruleNumber of [0, 32767, '*', 1.5]) {
      const issues = issuesFor((input) => {
        const entry = loose(input).networkAcls?.[0]?.inboundEntries as Record<string, unknown>[];
        if (entry[0]) entry[0].ruleNumber = ruleNumber;
      });
      expect(
        issues.map((issue) => issue.path),
        String(ruleNumber),
      ).toEqual([['networkAcls', 0, 'inboundEntries', 0, 'ruleNumber']]);
    }
  });

  it('NACL-02: rule numbers 1 and 32766 are valid', () => {
    for (const ruleNumber of [1, 32766]) {
      expect(
        issuesFor((input) => {
          const entry = input.networkAcls[0]?.inboundEntries[0];
          if (entry) entry.ruleNumber = ruleNumber;
        }),
      ).toEqual([]);
    }
  });

  it('SG-04: a tcp rule without ports is a schema error', () => {
    const issues = issuesFor((input) => {
      const rule = loose(input).securityGroups?.[1]?.inboundRules as Record<string, unknown>[];
      if (rule[0]) delete rule[0].fromPort;
    });
    expect(issues.map((issue) => issue.path)).toEqual([
      ['securityGroups', 1, 'inboundRules', 0, 'fromPort'],
    ]);
  });

  it('SG-04: an all rule with ports is a schema error', () => {
    const issues = issuesFor((input) => {
      const rule = loose(input).securityGroups?.[1]?.outboundRules as Record<string, unknown>[];
      if (rule[0]) rule[0].fromPort = 80;
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path.slice(0, 4)).toEqual(['securityGroups', 1, 'outboundRules', 0]);
  });

  it('SG-04: fromPort above toPort is a schema error', () => {
    const issues = issuesFor((input) => {
      const rule = loose(input).securityGroups?.[1]?.inboundRules as Record<string, unknown>[];
      if (rule[0]) rule[0].fromPort = 81;
    });
    expect(issues.map((issue) => issue.path)).toEqual([
      ['securityGroups', 1, 'inboundRules', 0, 'toPort'],
    ]);
  });

  it('SCHEMA: unknown keys are schema errors', () => {
    const issues = issuesFor((input) => {
      const vpc = loose(input).vpcs?.[0];
      if (vpc) vpc.cidr = '10.0.0.0/16';
    });
    expect(issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['unrecognized_keys', ['vpcs', 0]],
    ]);
  });

  it('SCHEMA: IDs must use the resource prefix and lowercase hex', () => {
    for (const id of ['vpc-XYZ', 'subnet-0a', 'vpc-', 'vpc-0123456789abcdef01']) {
      const issues = issuesFor((input) => {
        const vpc = input.vpcs[0];
        if (vpc) vpc.id = id;
      });
      expect(
        issues.some((issue) => issue.path.join('.') === 'vpcs.0.id'),
        id,
      ).toBe(true);
    }
  });

  it('SCHEMA: a duplicate ID is a schema error', () => {
    const issues = issuesFor((input) => {
      input.internetGateways.push({ id: 'igw-0000000a' });
    });
    expect(structuralCodes(issues)).toEqual(['DUPLICATE_ID']);
    expect(issues[0]?.path).toEqual(['internetGateways', 1, 'id']);
  });

  it('SCHEMA: security group rule IDs and interface IDs are unique across resources', () => {
    const issues = issuesFor((input) => {
      const rule = input.securityGroups[1]?.inboundRules[0];
      if (rule) rule.id = 'sgr-00000001';
      input.instances.push(extraInstance('0000000b', '10.0.1.11'));
      const eni = input.instances[1]?.primaryNetworkInterface;
      if (eni) eni.id = 'eni-0000000a';
    });
    expect(structuralCodes(issues)).toEqual(['DUPLICATE_ID', 'DUPLICATE_ID']);
  });

  it('SCHEMA: an unknown reference is a schema error with the path of the reference', () => {
    const issues = issuesFor((input) => {
      const subnet = input.subnets[0];
      if (subnet) subnet.routeTableId = 'rtb-0000000f';
    });
    expect(structuralCodes(issues)).toEqual(['UNKNOWN_REFERENCE']);
    expect(issues[0]?.path).toEqual(['subnets', 0, 'routeTableId']);
    expect(issues[0]?.params).toMatchObject({ referenceType: 'route-table', id: 'rtb-0000000f' });
  });

  it('SCHEMA: every kind of reference is checked', () => {
    const issues = issuesFor((input) => {
      const vpc = input.vpcs[0];
      if (vpc) {
        vpc.mainRouteTableId = 'rtb-0000000f';
        vpc.defaultNetworkAclId = 'acl-0000000f';
        vpc.defaultSecurityGroupId = 'sg-0000000f';
      }
      const subnet = input.subnets[0];
      if (subnet) {
        subnet.vpcId = 'vpc-0000000e';
        subnet.networkAclId = 'acl-0000000e';
      }
      const table = input.routeTables[0];
      if (table) table.vpcId = 'vpc-0000000d';
      const route = input.routeTables[1]?.routes[0];
      if (route) route.target = { type: 'internet-gateway', internetGatewayId: 'igw-0000000f' };
      const igw = input.internetGateways[0];
      if (igw) igw.attachedVpcId = 'vpc-0000000f';
      const group = input.securityGroups[0];
      if (group) group.vpcId = 'vpc-0000000c';
      const rule = input.securityGroups[0]?.inboundRules[0];
      if (rule) rule.peer = { type: 'security-group', securityGroupId: 'sg-0000000e' };
      const acl = input.networkAcls[0];
      if (acl) acl.vpcId = 'vpc-0000000b';
      const eni = input.instances[0]?.primaryNetworkInterface;
      if (eni) {
        eni.subnetId = 'subnet-0000000f';
        eni.securityGroupIds = ['sg-0000000d'];
      }
    });
    expect(issues.map((issue) => issue.path.join('.'))).toEqual([
      'vpcs.0.mainRouteTableId',
      'vpcs.0.defaultNetworkAclId',
      'vpcs.0.defaultSecurityGroupId',
      'subnets.0.vpcId',
      'subnets.0.networkAclId',
      'routeTables.0.vpcId',
      'routeTables.1.routes.0.target.internetGatewayId',
      'internetGateways.0.attachedVpcId',
      'securityGroups.0.vpcId',
      'securityGroups.0.inboundRules.0.peer.securityGroupId',
      'networkAcls.0.vpcId',
      'instances.0.primaryNetworkInterface.subnetId',
      'instances.0.primaryNetworkInterface.securityGroupIds.0',
    ]);
  });

  it('SCHEMA: two services on the same port are a schema error', () => {
    const issues = issuesFor((input) => {
      input.instances[0]?.runningServices.push({ protocol: 'tcp', port: 80, name: 'apache' });
    });
    expect(structuralCodes(issues)).toEqual(['DUPLICATE_SERVICE_PORT']);
    expect(issues[0]?.path).toEqual(['instances', 0, 'runningServices', 1, 'port']);
  });

  it('SCHEMA: an Availability Zone outside the region is a schema error', () => {
    const issues = issuesFor((input) => {
      const subnet = input.subnets[0];
      if (subnet) subnet.availabilityZone = 'eu-west-1a';
    });
    expect(structuralCodes(issues)).toEqual(['AZ_NOT_IN_REGION']);
  });

  it('SG-07: an interface needs 1 to 16 security groups', () => {
    const groupCount = (count: number) =>
      issuesFor((input) => {
        const eni = input.instances[0]?.primaryNetworkInterface;
        if (eni) eni.securityGroupIds = Array.from({ length: count }, () => 'sg-0000000a');
      }).length;
    expect(groupCount(0)).toBe(1);
    expect(groupCount(16)).toBe(0);
    expect(groupCount(17)).toBe(1);
  });
});
