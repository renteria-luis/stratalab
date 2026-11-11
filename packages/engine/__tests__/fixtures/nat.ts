import { topologySchema, type Topology, type TopologyInput } from '../../src/index';
import { at, baseInput } from './base';

/**
 * Fixture `nat-base` of docs/specs/r1-nat-gateway.md section 6: the R0 base topology plus a
 * private subnet whose route table sends 0.0.0.0/0 to a NAT gateway in the public subnet,
 * and an instance in the private subnet. Fresh object on every call.
 */
export function natBaseInput(): TopologyInput {
  const input = baseInput();
  input.subnets.push({
    id: 'subnet-0000000b',
    name: 'private-a',
    vpcId: 'vpc-0a1b2c3d',
    cidrBlock: '10.0.2.0/24',
    availabilityZone: 'us-east-1a',
    routeTableId: 'rtb-00000003',
  });
  input.routeTables.push({
    id: 'rtb-00000003',
    name: 'private-rt',
    vpcId: 'vpc-0a1b2c3d',
    routes: [
      {
        destinationCidrBlock: '0.0.0.0/0',
        target: { type: 'nat-gateway', natGatewayId: 'nat-0000000a' },
      },
    ],
  });
  input.natGateways = [
    {
      id: 'nat-0000000a',
      name: 'nat-a',
      subnetId: 'subnet-0000000a',
      connectivityType: 'public',
      privateIpAddress: '10.0.1.20',
      elasticIpAddress: '203.0.113.30',
    },
  ];
  input.securityGroups.push({
    id: 'sg-0000000b',
    vpcId: 'vpc-0a1b2c3d',
    name: 'app',
    description: 'App servers',
    inboundRules: [],
    outboundRules: [
      { id: 'sgr-000000b1', protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
    ],
  });
  input.instances.push({
    id: 'i-0000000b',
    name: 'app-1',
    platform: 'linux',
    primaryNetworkInterface: {
      id: 'eni-0000000b',
      subnetId: 'subnet-0000000b',
      privateIpAddress: '10.0.2.10',
      securityGroupIds: ['sg-0000000b'],
    },
    runningServices: [],
  });
  return input;
}

/** Applies `change` to a fresh `nat-base` input and parses it. Throws if it isn't schema-valid. */
export function parseNatBase(change: (input: TopologyInput) => void = () => undefined): Topology {
  const input = natBaseInput();
  change(input);
  return topologySchema.parse(input);
}

/** The NAT gateway `nat-a` of `nat-base`. */
export function natA(input: TopologyInput) {
  return at(input.natGateways ?? [], 0);
}
