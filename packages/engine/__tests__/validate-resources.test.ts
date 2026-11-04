import { describe, expect, it } from 'vitest';
import { validate, type Issue, type IssueCode, type TopologyInput } from '../src/index';
import { addOtherVpc, at, parseBase } from './fixtures/base';

function issuesFor(change: (input: TopologyInput) => void): Issue[] {
  return validate(parseBase(change));
}

function withCode(issues: Issue[], code: IssueCode): Issue[] {
  return issues.filter((issue) => issue.code === code);
}

/** The public route table of the base topology (rtb-00000002). */
function publicRouteTable(input: TopologyInput) {
  return at(input.routeTables, 1);
}

/** The `web` security group of the base topology (sg-0000000a). */
function webGroup(input: TopologyInput) {
  return at(input.securityGroups, 1);
}

function addRoute(destinationCidrBlock: string, internetGatewayId = 'igw-0000000a') {
  return (input: TopologyInput) => {
    publicRouteTable(input).routes.push({
      destinationCidrBlock,
      target: { type: 'internet-gateway', internetGatewayId },
    });
  };
}

function sgRule(index: number) {
  return {
    id: `sgr-${(0x1000 + index).toString(16)}`,
    protocol: 'tcp',
    fromPort: 1000 + index,
    toPort: 1000 + index,
    peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' },
  } as const;
}

function naclEntry(ruleNumber: number) {
  return { ruleNumber, protocol: 'all', cidrBlock: '0.0.0.0/0', action: 'allow' } as const;
}

describe('validate: references across VPCs', () => {
  it('VALIDATE: a second, complete VPC raises no issue', () => {
    expect(issuesFor(addOtherVpc)).toEqual([]);
  });

  it('RT-01: a subnet or VPC that points to a route table of another VPC is invalid', () => {
    const subnetIssues = issuesFor((input) => {
      addOtherVpc(input);
      at(input.subnets, 0).routeTableId = 'rtb-0000000b';
    });
    expect(subnetIssues).toEqual([
      {
        code: 'VPC_MISMATCH',
        severity: 'error',
        ruleIds: ['RT-01'],
        fidelity: 'Exact',
        resource: { type: 'subnet', id: 'subnet-0000000a' },
        path: ['subnets', 0, 'routeTableId'],
        related: [{ type: 'route-table', id: 'rtb-0000000b' }],
        params: { vpcId: 'vpc-0a1b2c3d', otherVpcId: 'vpc-0000000b' },
      },
    ]);

    const vpcIssues = issuesFor((input) => {
      addOtherVpc(input);
      at(input.vpcs, 1).mainRouteTableId = 'rtb-00000001';
    });
    expect(vpcIssues).toEqual([
      {
        code: 'VPC_MISMATCH',
        severity: 'error',
        ruleIds: ['RT-01'],
        fidelity: 'Exact',
        resource: { type: 'vpc', id: 'vpc-0000000b' },
        path: ['vpcs', 1, 'mainRouteTableId'],
        related: [{ type: 'route-table', id: 'rtb-00000001' }],
        params: { vpcId: 'vpc-0000000b', otherVpcId: 'vpc-0a1b2c3d' },
      },
    ]);
  });

  it('NACL-01: a subnet or VPC that points to a network ACL of another VPC is invalid', () => {
    const issues = issuesFor((input) => {
      addOtherVpc(input);
      at(input.subnets, 0).networkAclId = 'acl-0000000b';
      at(input.vpcs, 1).defaultNetworkAclId = 'acl-00000001';
    });
    expect(issues).toMatchObject([
      {
        code: 'VPC_MISMATCH',
        ruleIds: ['NACL-01'],
        resource: { type: 'vpc', id: 'vpc-0000000b' },
        path: ['vpcs', 1, 'defaultNetworkAclId'],
        related: [{ type: 'network-acl', id: 'acl-00000001' }],
      },
      {
        code: 'VPC_MISMATCH',
        ruleIds: ['NACL-01'],
        resource: { type: 'subnet', id: 'subnet-0000000a' },
        path: ['subnets', 0, 'networkAclId'],
        related: [{ type: 'network-acl', id: 'acl-0000000b' }],
      },
    ]);
  });

  it('SG-06: an interface or VPC that uses a security group of another VPC is invalid', () => {
    const issues = issuesFor((input) => {
      addOtherVpc(input);
      at(input.vpcs, 1).defaultSecurityGroupId = 'sg-00000001';
      at(input.instances, 0).primaryNetworkInterface.securityGroupIds = [
        'sg-0000000a',
        'sg-0000000b',
      ];
    });
    expect(issues).toMatchObject([
      {
        code: 'VPC_MISMATCH',
        ruleIds: ['SG-06'],
        resource: { type: 'vpc', id: 'vpc-0000000b' },
        path: ['vpcs', 1, 'defaultSecurityGroupId'],
        related: [{ type: 'security-group', id: 'sg-00000001' }],
        params: { vpcId: 'vpc-0000000b', otherVpcId: 'vpc-0a1b2c3d' },
      },
      {
        code: 'VPC_MISMATCH',
        ruleIds: ['SG-06'],
        resource: { type: 'network-interface', id: 'eni-0000000a' },
        path: ['instances', 0, 'primaryNetworkInterface', 'securityGroupIds', 1],
        related: [{ type: 'security-group', id: 'sg-0000000b' }],
        params: { vpcId: 'vpc-0a1b2c3d', otherVpcId: 'vpc-0000000b' },
      },
    ]);
  });

  it('SG-04: a rule that references a security group of another VPC is invalid', () => {
    const issues = issuesFor((input) => {
      addOtherVpc(input);
      webGroup(input).inboundRules.push({
        id: 'sgr-0000000c',
        protocol: 'tcp',
        fromPort: 22,
        toPort: 22,
        peer: { type: 'security-group', securityGroupId: 'sg-0000000b' },
      });
    });
    expect(issues).toEqual([
      {
        code: 'VPC_MISMATCH',
        severity: 'error',
        ruleIds: ['SG-04'],
        fidelity: 'Exact',
        resource: { type: 'security-group', id: 'sg-0000000a' },
        path: ['securityGroups', 1, 'inboundRules', 1, 'peer', 'securityGroupId'],
        related: [{ type: 'security-group', id: 'sg-0000000b' }],
        params: { vpcId: 'vpc-0a1b2c3d', otherVpcId: 'vpc-0000000b' },
      },
    ]);
  });
});

describe('validate: routes and internet gateways', () => {
  it('RT-11: two routes with the same destination in one table are invalid', () => {
    // 198.51.100.7/24 is stored as 198.51.100.0/24 (ADR-05), so it repeats the first route.
    const issues = issuesFor((input) => {
      addRoute('198.51.100.0/24')(input);
      addRoute('198.51.100.7/24')(input);
    });
    expect(issues).toEqual([
      {
        code: 'ROUTE_DUPLICATE_DESTINATION',
        severity: 'error',
        ruleIds: ['RT-11'],
        fidelity: 'Exact',
        resource: { type: 'route-table', id: 'rtb-00000002' },
        path: ['routeTables', 1, 'routes', 2, 'destinationCidrBlock'],
        params: { destinationCidrBlock: '198.51.100.0/24', firstRouteIndex: 1 },
      },
    ]);
  });

  it('RT-11: routes with different prefix lengths are not duplicates', () => {
    const issues = issuesFor((input) => {
      addRoute('198.51.100.0/24')(input);
      addRoute('198.51.100.0/25')(input);
    });
    expect(issues).toEqual([]);
  });

  it('RT-11: a route to 169.254.168.0/22 or inside it is invalid; a larger block is allowed', () => {
    for (const destination of ['169.254.168.0/22', '169.254.169.0/24', '169.254.169.254/32']) {
      expect(issuesFor(addRoute(destination)), destination).toEqual([
        {
          code: 'ROUTE_DESTINATION_RESERVED',
          severity: 'error',
          ruleIds: ['RT-11'],
          fidelity: 'Exact',
          resource: { type: 'route-table', id: 'rtb-00000002' },
          path: ['routeTables', 1, 'routes', 1, 'destinationCidrBlock'],
          params: { destinationCidrBlock: destination, reservedBlock: '169.254.168.0/22' },
        },
      ]);
    }
    for (const destination of ['169.254.0.0/16', '169.254.172.0/22', '169.254.164.0/22']) {
      expect(issuesFor(addRoute(destination)), destination).toEqual([]);
    }
  });

  it('RT-03: a stored route equal to or inside the VPC CIDR conflicts with the local route', () => {
    for (const destination of ['10.0.0.0/16', '10.0.5.0/24']) {
      expect(issuesFor(addRoute(destination)), destination).toEqual([
        {
          code: 'LOCAL_ROUTE_CONFLICT',
          severity: 'error',
          ruleIds: ['RT-03'],
          fidelity: 'Exact',
          resource: { type: 'route-table', id: 'rtb-00000002' },
          path: ['routeTables', 1, 'routes', 1, 'destinationCidrBlock'],
          params: { destinationCidrBlock: destination, vpcCidrBlock: '10.0.0.0/16' },
        },
      ]);
    }
    for (const destination of ['10.0.0.0/8', '10.1.0.0/16']) {
      expect(issuesFor(addRoute(destination)), destination).toEqual([]);
    }
  });

  it('IGW-05: two internet gateways attached to one VPC are invalid', () => {
    const issues = issuesFor((input) => {
      input.internetGateways.push({ id: 'igw-0000000b', attachedVpcId: 'vpc-0a1b2c3d' });
    });
    expect(issues).toEqual([
      {
        code: 'IGW_MULTIPLE_ATTACHED',
        severity: 'error',
        ruleIds: ['IGW-05'],
        fidelity: 'Exact',
        resource: { type: 'internet-gateway', id: 'igw-0000000b' },
        path: ['internetGateways', 1, 'attachedVpcId'],
        related: [{ type: 'internet-gateway', id: 'igw-0000000a' }],
        params: { vpcId: 'vpc-0a1b2c3d' },
      },
    ]);
  });

  it('IGW-05: a second, detached internet gateway is valid', () => {
    const issues = issuesFor((input) => {
      input.internetGateways.push({ id: 'igw-0000000b' });
    });
    expect(issues).toEqual([]);
  });

  it('RT-08: a route to a detached internet gateway raises no issue', () => {
    const issues = issuesFor((input) => {
      delete at(input.internetGateways, 0).attachedVpcId;
    });
    expect(issues).toEqual([]);
  });

  it('RT-08: a route to an internet gateway of another VPC raises no issue', () => {
    const issues = issuesFor((input) => {
      addOtherVpc(input);
      at(input.internetGateways, 0).attachedVpcId = 'vpc-0000000b';
    });
    expect(issues).toEqual([]);
  });
});

describe('validate: security groups and network ACLs', () => {
  it('SG-06: name and description need 1 to 255 allowed characters; a name cannot start with sg-', () => {
    const cases: [string, (group: ReturnType<typeof webGroup>) => void, string, string][] = [
      ['empty name', (g) => (g.name = ''), 'name', 'empty'],
      ['name of trailing spaces only', (g) => (g.name = '   '), 'name', 'empty'],
      ['256-character name', (g) => (g.name = 'a'.repeat(256)), 'name', 'too-long'],
      ['accented name', (g) => (g.name = 'wéb'), 'name', 'invalid-characters'],
      ['name with a pipe', (g) => (g.name = 'web|1'), 'name', 'invalid-characters'],
      ['sg- prefix', (g) => (g.name = 'sg-web'), 'name', 'sg-prefix'],
      ['empty description', (g) => (g.description = ''), 'description', 'empty'],
      [
        '256-character description',
        (g) => (g.description = 'a'.repeat(256)),
        'description',
        'too-long',
      ],
      [
        'description with <',
        (g) => (g.description = 'Allow <80>'),
        'description',
        'invalid-characters',
      ],
    ];
    for (const [label, change, field, reason] of cases) {
      const issues = issuesFor((input) => {
        change(webGroup(input));
      });
      expect(issues, label).toEqual([
        {
          code: 'SG_NAME_INVALID',
          severity: 'error',
          ruleIds: ['SG-06'],
          fidelity: 'Exact',
          resource: { type: 'security-group', id: 'sg-0000000a' },
          path: ['securityGroups', 1, field],
          params: { field, reason, maxLength: 255 },
        },
      ]);
    }
  });

  it('SG-06: every allowed character and 255-character values are valid', () => {
    const issues = issuesFor((input) => {
      const group = webGroup(input);
      group.name = 'Web Servers ._-:/()#,@[]+=&;{}!$*';
      group.description = 'a'.repeat(255);
    });
    expect(issues).toEqual([]);
    expect(issuesFor((input) => (webGroup(input).name = 'a'.repeat(255)))).toEqual([]);
  });

  it('SG-06: two groups in one VPC with the same name, ignoring case, are invalid', () => {
    const issues = issuesFor((input) => {
      webGroup(input).name = 'DEFAULT';
    });
    expect(issues).toEqual([
      {
        code: 'SG_NAME_DUPLICATE',
        severity: 'error',
        ruleIds: ['SG-06'],
        fidelity: 'Exact',
        resource: { type: 'security-group', id: 'sg-0000000a' },
        path: ['securityGroups', 1, 'name'],
        related: [{ type: 'security-group', id: 'sg-00000001' }],
        params: { name: 'DEFAULT', vpcId: 'vpc-0a1b2c3d' },
      },
    ]);
  });

  it('SG-06: trailing spaces are trimmed before names are compared', () => {
    const issues = issuesFor((input) => {
      webGroup(input).name = 'default  ';
    });
    expect(withCode(issues, 'SG_NAME_DUPLICATE')).toHaveLength(1);
  });

  it('SG-06: groups in different VPCs may share a name', () => {
    // The second VPC's default group is also named "default".
    expect(issuesFor(addOtherVpc)).toEqual([]);
  });

  it('NACL-08: a rule number used twice in one direction is invalid', () => {
    const issues = issuesFor((input) => {
      at(input.networkAcls, 0).inboundEntries.push({ ...naclEntry(100), action: 'deny' });
    });
    expect(issues).toEqual([
      {
        code: 'NACL_RULE_NUMBER_DUPLICATE',
        severity: 'error',
        ruleIds: ['NACL-08'],
        fidelity: 'Exact',
        resource: { type: 'network-acl', id: 'acl-00000001' },
        path: ['networkAcls', 0, 'inboundEntries', 1, 'ruleNumber'],
        params: { ruleNumber: 100, direction: 'inbound' },
      },
    ]);
  });

  it('NACL-08: the same rule number in each direction is valid', () => {
    // The base ACL already uses rule 100 inbound and outbound.
    expect(validate(parseBase())).toEqual([]);
  });
});

describe('validate: quotas', () => {
  it('SG-07: more than 60 rules in one direction of a security group is a warning', () => {
    const issues = issuesFor((input) => {
      webGroup(input).outboundRules = Array.from({ length: 61 }, (_, i) => sgRule(i));
    });
    expect(issues).toEqual([
      {
        code: 'QUOTA_EXCEEDED',
        severity: 'warning',
        ruleIds: ['SG-07'],
        fidelity: 'Exact',
        resource: { type: 'security-group', id: 'sg-0000000a' },
        path: ['securityGroups', 1, 'outboundRules'],
        params: { quota: 'rules-per-security-group', direction: 'outbound', limit: 60, count: 61 },
      },
    ]);
  });

  it('SG-07: 60 rules per direction is within the quota', () => {
    const issues = issuesFor((input) => {
      webGroup(input).inboundRules = Array.from({ length: 60 }, (_, i) => sgRule(i));
      webGroup(input).outboundRules = Array.from({ length: 60 }, (_, i) => sgRule(100 + i));
    });
    expect(issues).toEqual([]);
  });

  it('SG-07: more than 5 security groups on one interface is a warning', () => {
    const withGroups = (count: number) => (input: TopologyInput) => {
      const ids = Array.from({ length: count }, (_, i) => `sg-${(0xf0 + i).toString(16)}`);
      for (const [i, id] of ids.entries()) {
        input.securityGroups.push({
          id,
          vpcId: 'vpc-0a1b2c3d',
          name: `extra-${String(i)}`,
          description: 'extra',
          inboundRules: [],
          outboundRules: [],
        });
      }
      at(input.instances, 0).primaryNetworkInterface.securityGroupIds = ids;
    };
    expect(issuesFor(withGroups(5))).toEqual([]);
    expect(issuesFor(withGroups(6))).toEqual([
      {
        code: 'QUOTA_EXCEEDED',
        severity: 'warning',
        ruleIds: ['SG-07'],
        fidelity: 'Exact',
        resource: { type: 'network-interface', id: 'eni-0000000a' },
        path: ['instances', 0, 'primaryNetworkInterface', 'securityGroupIds'],
        params: { quota: 'security-groups-per-network-interface', limit: 5, count: 6 },
      },
    ]);
  });

  it('NACL-09: more than 20 entries in one direction of a network ACL is a warning', () => {
    const withEntries = (count: number) => (input: TopologyInput) => {
      at(input.networkAcls, 0).inboundEntries = Array.from({ length: count }, (_, i) =>
        naclEntry(100 + i),
      );
    };
    expect(issuesFor(withEntries(20))).toEqual([]);
    expect(issuesFor(withEntries(21))).toEqual([
      {
        code: 'QUOTA_EXCEEDED',
        severity: 'warning',
        ruleIds: ['NACL-09'],
        fidelity: 'Exact',
        resource: { type: 'network-acl', id: 'acl-00000001' },
        path: ['networkAcls', 0, 'inboundEntries'],
        params: { quota: 'rules-per-network-acl', direction: 'inbound', limit: 20, count: 21 },
      },
    ]);
  });
});

describe('validate: order', () => {
  it('VALIDATE: the same topology always gives the same issues in the same order', () => {
    const topology = parseBase((input) => {
      addOtherVpc(input);
      at(input.vpcs, 1).defaultSecurityGroupId = 'sg-00000001';
      addRoute('10.0.9.0/24')(input);
      addRoute('10.0.9.0/24')(input);
      input.internetGateways.push({ id: 'igw-0000000b', attachedVpcId: 'vpc-0a1b2c3d' });
      webGroup(input).name = 'sg-default';
      at(input.networkAcls, 0).outboundEntries.push(naclEntry(100));
      at(input.instances, 0).primaryNetworkInterface.securityGroupIds = [
        'sg-0000000a',
        'sg-0000000b',
      ];
    });
    const snapshot = JSON.stringify(topology);
    const first = validate(topology);
    expect(first.map((issue) => [issue.code, issue.path.slice(0, 2).join('.')])).toEqual([
      ['VPC_MISMATCH', 'vpcs.1'],
      ['ROUTE_DUPLICATE_DESTINATION', 'routeTables.1'],
      ['LOCAL_ROUTE_CONFLICT', 'routeTables.1'],
      ['LOCAL_ROUTE_CONFLICT', 'routeTables.1'],
      ['IGW_MULTIPLE_ATTACHED', 'internetGateways.1'],
      ['SG_NAME_INVALID', 'securityGroups.1'],
      ['NACL_RULE_NUMBER_DUPLICATE', 'networkAcls.0'],
      ['VPC_MISMATCH', 'instances.0'],
    ]);
    expect(validate(topology)).toEqual(first);
    expect(JSON.stringify(topology)).toBe(snapshot);
  });
});
