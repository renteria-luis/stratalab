import { topologySchema, type Topology, type TopologyInput } from '../../src/index';

/**
 * Lab 1 solution topology from docs/specs/r0-engine.md section 3.9.
 * Returns a fresh object on every call so tests can mutate it freely.
 */
export function baseInput(): TopologyInput {
  return {
    schemaVersion: 1,
    region: 'us-east-1',
    vpcs: [
      {
        id: 'vpc-0a1b2c3d',
        name: 'lab-vpc',
        cidrBlock: '10.0.0.0/16',
        mainRouteTableId: 'rtb-00000001',
        defaultNetworkAclId: 'acl-00000001',
        defaultSecurityGroupId: 'sg-00000001',
      },
    ],
    subnets: [
      {
        id: 'subnet-0000000a',
        name: 'public-a',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.1.0/24',
        availabilityZone: 'us-east-1a',
        mapPublicIpOnLaunch: true,
        routeTableId: 'rtb-00000002',
      },
    ],
    routeTables: [
      { id: 'rtb-00000001', vpcId: 'vpc-0a1b2c3d', routes: [] },
      {
        id: 'rtb-00000002',
        name: 'public-rt',
        vpcId: 'vpc-0a1b2c3d',
        routes: [
          {
            destinationCidrBlock: '0.0.0.0/0',
            target: { type: 'internet-gateway', internetGatewayId: 'igw-0000000a' },
          },
        ],
      },
    ],
    internetGateways: [{ id: 'igw-0000000a', attachedVpcId: 'vpc-0a1b2c3d' }],
    securityGroups: [
      {
        id: 'sg-00000001',
        vpcId: 'vpc-0a1b2c3d',
        name: 'default',
        description: 'default VPC security group',
        inboundRules: [
          {
            id: 'sgr-00000001',
            protocol: 'all',
            peer: { type: 'security-group', securityGroupId: 'sg-00000001' },
          },
        ],
        outboundRules: [
          { id: 'sgr-00000002', protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
        ],
      },
      {
        id: 'sg-0000000a',
        vpcId: 'vpc-0a1b2c3d',
        name: 'web',
        description: 'Allow HTTP',
        inboundRules: [
          {
            id: 'sgr-0000000a',
            protocol: 'tcp',
            fromPort: 80,
            toPort: 80,
            peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' },
          },
        ],
        outboundRules: [
          { id: 'sgr-0000000b', protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
        ],
      },
    ],
    networkAcls: [
      {
        id: 'acl-00000001',
        vpcId: 'vpc-0a1b2c3d',
        inboundEntries: [
          { ruleNumber: 100, protocol: 'all', cidrBlock: '0.0.0.0/0', action: 'allow' },
        ],
        outboundEntries: [
          { ruleNumber: 100, protocol: 'all', cidrBlock: '0.0.0.0/0', action: 'allow' },
        ],
      },
    ],
    instances: [
      {
        id: 'i-0000000a',
        name: 'web-1',
        platform: 'linux',
        primaryNetworkInterface: {
          id: 'eni-0000000a',
          subnetId: 'subnet-0000000a',
          privateIpAddress: '10.0.1.10',
          publicIp: { kind: 'auto-assigned', address: '203.0.113.25' },
          securityGroupIds: ['sg-0000000a'],
        },
        runningServices: [
          { protocol: 'tcp', port: 80, name: 'nginx', responseHtml: '<h1>It works</h1>' },
        ],
      },
    ],
  };
}

/** A second instance in the base subnet, with its own IDs and no public address. */
export function extraInstance(
  suffix: string,
  privateIpAddress: string,
  subnetId = 'subnet-0000000a',
): TopologyInput['instances'][number] {
  return {
    id: `i-${suffix}`,
    platform: 'linux',
    primaryNetworkInterface: {
      id: `eni-${suffix}`,
      subnetId,
      privateIpAddress,
      securityGroupIds: ['sg-00000001'],
    },
    runningServices: [],
  };
}

/**
 * Adds a second VPC (vpc-0000000b, 10.1.0.0/16) with its own main route table, default network
 * ACL, default security group and one subnet (subnet-0000000b, 10.1.1.0/24). Valid on its own.
 */
export function addOtherVpc(input: TopologyInput): void {
  const allowAll = {
    ruleNumber: 100,
    protocol: 'all',
    cidrBlock: '0.0.0.0/0',
    action: 'allow',
  } as const;
  input.vpcs.push({
    id: 'vpc-0000000b',
    cidrBlock: '10.1.0.0/16',
    mainRouteTableId: 'rtb-0000000b',
    defaultNetworkAclId: 'acl-0000000b',
    defaultSecurityGroupId: 'sg-0000000b',
  });
  input.subnets.push({
    id: 'subnet-0000000b',
    vpcId: 'vpc-0000000b',
    cidrBlock: '10.1.1.0/24',
    availabilityZone: 'us-east-1b',
  });
  input.routeTables.push({ id: 'rtb-0000000b', vpcId: 'vpc-0000000b', routes: [] });
  input.securityGroups.push({
    id: 'sg-0000000b',
    vpcId: 'vpc-0000000b',
    name: 'default',
    description: 'default VPC security group',
    inboundRules: [
      {
        id: 'sgr-000000b1',
        protocol: 'all',
        peer: { type: 'security-group', securityGroupId: 'sg-0000000b' },
      },
    ],
    outboundRules: [
      { id: 'sgr-000000b2', protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
    ],
  });
  input.networkAcls.push({
    id: 'acl-0000000b',
    vpcId: 'vpc-0000000b',
    inboundEntries: [allowAll],
    outboundEntries: [allowAll],
  });
}

/** `items[index]`, or a test failure when it doesn't exist. */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Fixture has no item at index ${String(index)}`);
  return item;
}

/** Applies `change` to a fresh base input and parses it. Throws if the result is not schema-valid. */
export function parseBase(change: (input: TopologyInput) => void = () => undefined): Topology {
  const input = baseInput();
  change(input);
  return topologySchema.parse(input);
}
