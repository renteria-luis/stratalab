import { describe, expect, it } from 'vitest';
import { validate, type Issue, type IssueCode, type TopologyInput } from '../src/index';
import { extraInstance, parseBase } from './fixtures/base';

function issuesFor(change: (input: TopologyInput) => void): Issue[] {
  return validate(parseBase(change));
}

function withCode(issues: Issue[], code: IssueCode): Issue[] {
  return issues.filter((issue) => issue.code === code);
}

function setVpcCidr(cidrBlock: string) {
  return (input: TopologyInput) => {
    const vpc = input.vpcs[0];
    if (vpc) vpc.cidrBlock = cidrBlock;
  };
}

function setSubnetCidr(cidrBlock: string) {
  return (input: TopologyInput) => {
    const subnet = input.subnets[0];
    if (subnet) subnet.cidrBlock = cidrBlock;
  };
}

function setPrivateIp(address: string) {
  return (input: TopologyInput) => {
    const eni = input.instances[0]?.primaryNetworkInterface;
    if (eni) eni.privateIpAddress = address;
  };
}

function setPublicIp(address: string) {
  return (input: TopologyInput) => {
    const eni = input.instances[0]?.primaryNetworkInterface;
    if (eni) eni.publicIp = { kind: 'elastic-ip', address };
  };
}

/** Adds a second VPC with one subnet, reusing the base VPC's default resources. */
function addSecondVpc(vpcCidr: string, subnetCidr: string) {
  return (input: TopologyInput) => {
    input.vpcs.push({
      id: 'vpc-0000000b',
      cidrBlock: vpcCidr,
      mainRouteTableId: 'rtb-00000001',
      defaultNetworkAclId: 'acl-00000001',
      defaultSecurityGroupId: 'sg-00000001',
    });
    input.subnets.push({
      id: 'subnet-0000000b',
      vpcId: 'vpc-0000000b',
      cidrBlock: subnetCidr,
      availabilityZone: 'us-east-1b',
    });
  };
}

describe('validate: addressing rules', () => {
  it('VALIDATE: the lab 1 example has no issues', () => {
    expect(validate(parseBase())).toEqual([]);
  });

  it('ADR-01: a VPC CIDR outside /16 to /28 is invalid', () => {
    expect(withCode(issuesFor(setVpcCidr('10.0.0.0/15')), 'VPC_SIZE_INVALID')).toEqual([
      {
        code: 'VPC_SIZE_INVALID',
        severity: 'error',
        ruleIds: ['ADR-01'],
        fidelity: 'Exact',
        resource: { type: 'vpc', id: 'vpc-0a1b2c3d' },
        path: ['vpcs', 0, 'cidrBlock'],
        params: {
          cidrBlock: '10.0.0.0/15',
          prefixLength: 15,
          minPrefixLength: 16,
          maxPrefixLength: 28,
        },
      },
    ]);
    expect(withCode(issuesFor(setVpcCidr('10.0.1.0/29')), 'VPC_SIZE_INVALID')).toHaveLength(1);
  });

  it('ADR-01: /16 and /28 VPCs are valid sizes', () => {
    expect(withCode(issuesFor(setVpcCidr('10.0.0.0/16')), 'VPC_SIZE_INVALID')).toEqual([]);
    expect(withCode(issuesFor(setVpcCidr('10.0.1.0/28')), 'VPC_SIZE_INVALID')).toEqual([]);
  });

  it('ADR-01: a VPC CIDR in a restricted block is invalid; subsets are Inferred', () => {
    const cases: [string, string, 'Exact' | 'Inferred'][] = [
      ['169.254.0.0/16', '169.254.0.0/16', 'Exact'],
      ['127.0.0.0/16', '127.0.0.0/8', 'Inferred'],
      ['0.0.0.0/16', '0.0.0.0/8', 'Inferred'],
      ['224.1.0.0/16', '224.0.0.0/4', 'Inferred'],
    ];
    for (const [cidrBlock, restrictedBlock, fidelity] of cases) {
      const [issue, ...rest] = withCode(issuesFor(setVpcCidr(cidrBlock)), 'VPC_CIDR_RESTRICTED');
      expect(rest, cidrBlock).toEqual([]);
      expect(issue, cidrBlock).toMatchObject({
        ruleIds: ['ADR-01'],
        fidelity,
        params: { cidrBlock, restrictedBlock },
      });
    }
  });

  it('ADR-01: a publicly routable VPC CIDR is allowed', () => {
    const issues = issuesFor(setVpcCidr('198.51.100.0/24'));
    expect(withCode(issues, 'VPC_SIZE_INVALID')).toEqual([]);
    expect(withCode(issues, 'VPC_CIDR_RESTRICTED')).toEqual([]);
  });

  it('ADR-02: a subnet CIDR outside /16 to /28 is invalid', () => {
    const issues = withCode(issuesFor(setSubnetCidr('10.0.1.0/29')), 'SUBNET_SIZE_INVALID');
    expect(issues).toEqual([
      {
        code: 'SUBNET_SIZE_INVALID',
        severity: 'error',
        ruleIds: ['ADR-02'],
        fidelity: 'Exact',
        resource: { type: 'subnet', id: 'subnet-0000000a' },
        path: ['subnets', 0, 'cidrBlock'],
        params: {
          cidrBlock: '10.0.1.0/29',
          prefixLength: 29,
          minPrefixLength: 16,
          maxPrefixLength: 28,
        },
      },
    ]);
    expect(withCode(issuesFor(setSubnetCidr('10.0.0.0/15')), 'SUBNET_SIZE_INVALID')).toHaveLength(
      1,
    );
  });

  it('ADR-02: a subnet equal to the VPC CIDR is valid', () => {
    expect(issuesFor(setSubnetCidr('10.0.0.0/16'))).toEqual([]);
  });

  it('ADR-02: a /28 subnet is valid', () => {
    expect(issuesFor(setSubnetCidr('10.0.1.0/28'))).toEqual([]);
  });

  it('ADR-02: a subnet outside its VPC CIDR is invalid', () => {
    const issues = issuesFor((input) => {
      setSubnetCidr('10.1.0.0/24')(input);
      setPrivateIp('10.1.0.10')(input);
    });
    expect(issues).toEqual([
      {
        code: 'SUBNET_CIDR_OUT_OF_VPC',
        severity: 'error',
        ruleIds: ['ADR-02'],
        fidelity: 'Exact',
        resource: { type: 'subnet', id: 'subnet-0000000a' },
        path: ['subnets', 0, 'cidrBlock'],
        params: { cidrBlock: '10.1.0.0/24', vpcCidrBlock: '10.0.0.0/16' },
      },
    ]);
  });

  it('ADR-03: overlapping subnets in one VPC are reported once, on the later subnet', () => {
    const issues = issuesFor((input) => {
      input.subnets.push({
        id: 'subnet-0000000b',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.1.128/25',
        availabilityZone: 'us-east-1a',
      });
    });
    expect(issues).toEqual([
      {
        code: 'CIDR_OVERLAP',
        severity: 'error',
        ruleIds: ['ADR-03'],
        fidelity: 'Exact',
        resource: { type: 'subnet', id: 'subnet-0000000b' },
        path: ['subnets', 1, 'cidrBlock'],
        related: [{ type: 'subnet', id: 'subnet-0000000a' }],
        params: { cidrBlock: '10.0.1.128/25', otherCidrBlock: '10.0.1.0/24' },
      },
    ]);
  });

  it('ADR-03: adjacent subnets do not overlap', () => {
    const issues = issuesFor((input) => {
      input.subnets.push({
        id: 'subnet-0000000b',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.2.0/24',
        availabilityZone: 'us-east-1a',
      });
    });
    expect(issues).toEqual([]);
  });

  it('ADR-03: subnets in different VPCs may overlap', () => {
    const issues = issuesFor(addSecondVpc('10.0.0.0/16', '10.0.1.0/24'));
    expect(withCode(issues, 'CIDR_OVERLAP')).toEqual([]);
  });

  it('ADR-09: a private address outside the subnet is invalid', () => {
    expect(issuesFor(setPrivateIp('10.0.2.10'))).toEqual([
      {
        code: 'IP_OUT_OF_SUBNET',
        severity: 'error',
        ruleIds: ['ADR-09'],
        fidelity: 'Exact',
        resource: { type: 'network-interface', id: 'eni-0000000a' },
        path: ['instances', 0, 'primaryNetworkInterface', 'privateIpAddress'],
        params: { ipAddress: '10.0.2.10', subnetCidrBlock: '10.0.1.0/24' },
      },
    ]);
  });

  it('ADR-04: 10.0.1.4 and 10.0.1.254 are usable; .0 to .3 and .255 are reserved in 10.0.1.0/24', () => {
    const cases: [string, string | null][] = [
      ['10.0.1.0', 'network'],
      ['10.0.1.1', 'vpc-router'],
      ['10.0.1.2', 'dns'],
      ['10.0.1.3', 'future-use'],
      ['10.0.1.4', null],
      ['10.0.1.254', null],
      ['10.0.1.255', 'broadcast'],
    ];
    for (const [address, purpose] of cases) {
      const issues = issuesFor(setPrivateIp(address));
      if (purpose === null) {
        expect(issues, address).toEqual([]);
      } else {
        expect(issues, address).toEqual([
          {
            code: 'IP_RESERVED',
            severity: 'error',
            ruleIds: ['ADR-04'],
            fidelity: 'Exact',
            resource: { type: 'network-interface', id: 'eni-0000000a' },
            path: ['instances', 0, 'primaryNetworkInterface', 'privateIpAddress'],
            params: { ipAddress: address, subnetCidrBlock: '10.0.1.0/24', purpose },
          },
        ]);
      }
    }
  });

  it('ADR-09: two interfaces with the same private address in one VPC are invalid (Inferred)', () => {
    const issues = issuesFor((input) => {
      input.instances.push(extraInstance('0000000b', '10.0.1.10'));
    });
    expect(issues).toEqual([
      {
        code: 'IP_DUPLICATE',
        severity: 'error',
        ruleIds: ['ADR-09'],
        fidelity: 'Inferred',
        resource: { type: 'network-interface', id: 'eni-0000000b' },
        path: ['instances', 1, 'primaryNetworkInterface', 'privateIpAddress'],
        related: [{ type: 'network-interface', id: 'eni-0000000a' }],
        params: { ipAddress: '10.0.1.10', kind: 'private' },
      },
    ]);
  });

  it('ADR-09: the same private address in different VPCs is valid', () => {
    const issues = issuesFor((input) => {
      addSecondVpc('10.0.0.0/16', '10.0.1.0/24')(input);
      input.instances.push(extraInstance('0000000b', '10.0.1.10', 'subnet-0000000b'));
    });
    expect(withCode(issues, 'IP_DUPLICATE')).toEqual([]);
  });

  it('ADR-10: two interfaces with the same public address are invalid (Inferred)', () => {
    const issues = issuesFor((input) => {
      const extra = extraInstance('0000000b', '10.0.1.11');
      extra.primaryNetworkInterface.publicIp = { kind: 'elastic-ip', address: '203.0.113.25' };
      input.instances.push(extra);
    });
    expect(issues).toEqual([
      {
        code: 'IP_DUPLICATE',
        severity: 'error',
        ruleIds: ['ADR-10'],
        fidelity: 'Inferred',
        resource: { type: 'network-interface', id: 'eni-0000000b' },
        path: ['instances', 1, 'primaryNetworkInterface', 'publicIp', 'address'],
        related: [{ type: 'network-interface', id: 'eni-0000000a' }],
        params: { ipAddress: '203.0.113.25', kind: 'public' },
      },
    ]);
  });

  it('ADR-10: a public address must not be private, shared, restricted or inside a VPC CIDR', () => {
    const cases: [string, string, string][] = [
      ['10.0.0.5', 'rfc1918', '10.0.0.0/8'],
      ['172.16.5.5', 'rfc1918', '172.16.0.0/12'],
      ['192.168.1.1', 'rfc1918', '192.168.0.0/16'],
      ['100.64.0.1', 'rfc6598', '100.64.0.0/10'],
      ['0.1.2.3', 'restricted', '0.0.0.0/8'],
      ['127.0.0.1', 'restricted', '127.0.0.0/8'],
      ['169.254.1.1', 'restricted', '169.254.0.0/16'],
      ['224.0.0.1', 'restricted', '224.0.0.0/4'],
    ];
    for (const [address, reason, range] of cases) {
      expect(issuesFor(setPublicIp(address)), address).toEqual([
        {
          code: 'PUBLIC_IP_INVALID',
          severity: 'error',
          ruleIds: ['ADR-10'],
          fidelity: 'Exact',
          resource: { type: 'network-interface', id: 'eni-0000000a' },
          path: ['instances', 0, 'primaryNetworkInterface', 'publicIp', 'address'],
          params: { ipAddress: address, reason, range },
        },
      ]);
    }
  });

  it('ADR-10: a public address inside any VPC CIDR is invalid', () => {
    const issues = issuesFor((input) => {
      addSecondVpc('198.51.100.0/24', '198.51.100.0/24')(input);
      setPublicIp('198.51.100.20')(input);
    });
    expect(withCode(issues, 'PUBLIC_IP_INVALID')).toMatchObject([
      { params: { ipAddress: '198.51.100.20', reason: 'vpc-cidr', range: '198.51.100.0/24' } },
    ]);
  });

  it('ADR-10: public addresses next to the special ranges are valid', () => {
    for (const address of ['203.0.113.25', '172.32.0.1', '100.128.0.1', '223.255.255.255']) {
      expect(issuesFor(setPublicIp(address)), address).toEqual([]);
    }
  });

  it('VALIDATE: issues come in collection order, then array order, then code order', () => {
    const issues = issuesFor((input) => {
      setVpcCidr('10.0.0.0/15')(input);
      input.subnets.push({
        id: 'subnet-0000000b',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.1.0/29',
        availabilityZone: 'us-east-1a',
      });
      setPrivateIp('10.0.1.255')(input);
      setPublicIp('10.9.9.9')(input);
    });
    expect(issues.map((issue) => [issue.code, issue.path.slice(0, 2).join('.')])).toEqual([
      ['VPC_SIZE_INVALID', 'vpcs.0'],
      ['SUBNET_SIZE_INVALID', 'subnets.1'],
      ['CIDR_OVERLAP', 'subnets.1'],
      ['IP_RESERVED', 'instances.0'],
      ['PUBLIC_IP_INVALID', 'instances.0'],
    ]);
  });

  it('VALIDATE: the same topology always gives the same issues and is not changed', () => {
    const topology = parseBase((input) => {
      setSubnetCidr('10.1.0.0/24')(input);
      setPublicIp('10.9.9.9')(input);
    });
    const snapshot = JSON.stringify(topology);
    const first = validate(topology);
    const second = validate(topology);
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
    expect(JSON.stringify(topology)).toBe(snapshot);
  });
});
