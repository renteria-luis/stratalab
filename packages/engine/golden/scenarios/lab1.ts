import type { TopologyInput } from '../../src/index';

/**
 * Copy of the lab 1 topologies (packages/labs/src/labs/lab-01.ts). The engine can't import
 * `@sim/labs` (it depends on the engine), so a labs test keeps this copy equal to `lab01`.
 * `fixed: false` is the initial topology, `fixed: true` the solution.
 */
export function lab1Topology(fixed: boolean): TopologyInput {
  const allowAll = {
    ruleNumber: 100,
    protocol: 'all',
    cidrBlock: '0.0.0.0/0',
    action: 'allow',
  } as const;
  const webPort = fixed ? 80 : 443;
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
        ...(fixed ? { routeTableId: 'rtb-00000002' } : {}),
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
    internetGateways: [{ id: 'igw-0000000a', name: 'lab-igw', attachedVpcId: 'vpc-0a1b2c3d' }],
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
        description: fixed ? 'Allow HTTP' : 'Allow HTTPS',
        inboundRules: [
          {
            id: 'sgr-0000000a',
            protocol: 'tcp',
            fromPort: webPort,
            toPort: webPort,
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
        inboundEntries: [allowAll],
        outboundEntries: [allowAll],
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
          {
            protocol: 'tcp',
            port: 80,
            name: 'nginx',
            responseHtml:
              '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>It works</title></head><body><h1>It works</h1><p>Served by web-1.</p></body></html>',
          },
          { protocol: 'tcp', port: 22, name: 'sshd' },
        ],
      },
    ],
  };
}
