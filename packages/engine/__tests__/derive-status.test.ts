import { describe, expect, it } from 'vitest';
import { deriveStatus, type TopologyInput } from '../src/index';
import { addOtherVpc, at, extraInstance, parseBase } from './fixtures/base';

function statusFor(change: (input: TopologyInput) => void = () => undefined) {
  return deriveStatus(parseBase(change));
}

/** Adds a private subnet 10.0.2.0/24 with no explicit associations. */
function addPrivateSubnet(input: TopologyInput) {
  input.subnets.push({
    id: 'subnet-0000000b',
    vpcId: 'vpc-0a1b2c3d',
    cidrBlock: '10.0.2.0/24',
    availabilityZone: 'us-east-1a',
  });
}

describe('deriveStatus', () => {
  it('STATUS: the lab 1 example', () => {
    expect(statusFor()).toEqual({
      vpcs: { 'vpc-0a1b2c3d': { internetGatewayId: 'igw-0000000a' } },
      subnets: {
        'subnet-0000000a': {
          type: 'public',
          routeTableId: 'rtb-00000002',
          routeTableAssociation: 'explicit',
          networkAclId: 'acl-00000001',
          networkAclAssociation: 'default',
          availableIpv4Count: 250,
        },
      },
      routeTables: {
        'rtb-00000001': {
          main: true,
          subnetIds: [],
          routes: [
            {
              destinationCidrBlock: '10.0.0.0/16',
              target: 'local',
              state: 'active',
              origin: 'CreateRouteTable',
            },
          ],
        },
        'rtb-00000002': {
          main: false,
          subnetIds: ['subnet-0000000a'],
          routes: [
            {
              destinationCidrBlock: '10.0.0.0/16',
              target: 'local',
              state: 'active',
              origin: 'CreateRouteTable',
            },
            {
              destinationCidrBlock: '0.0.0.0/0',
              target: 'igw-0000000a',
              state: 'active',
              origin: 'CreateRoute',
            },
          ],
        },
      },
      internetGateways: { 'igw-0000000a': { state: 'attached' } },
      natGateways: {},
      instances: {
        'i-0000000a': {
          publicIpv4Address: '203.0.113.25',
          clientPortRange: { from: 32768, to: 61000 },
        },
      },
    });
  });

  it('RT-09: a subnet with an active route to an IGW is public; without one it is private', () => {
    const status = statusFor(addPrivateSubnet);
    expect(status.subnets['subnet-0000000a']?.type).toBe('public');
    expect(status.subnets['subnet-0000000b']?.type).toBe('private');
  });

  it('RT-09: a subnet whose only IGW route is blackhole is public, as the console shows (Q8)', () => {
    const status = statusFor((input) => {
      delete at(input.internetGateways, 0).attachedVpcId;
    });
    expect(status.subnets['subnet-0000000a']?.type).toBe('public');
    expect(status.routeTables['rtb-00000002']?.routes[1]).toEqual({
      destinationCidrBlock: '0.0.0.0/0',
      target: 'igw-0000000a',
      state: 'blackhole',
      origin: 'CreateRoute',
    });
    expect(status.vpcs['vpc-0a1b2c3d']).toEqual({ internetGatewayId: null });
    expect(status.internetGateways['igw-0000000a']).toEqual({ state: 'detached' });
  });

  it('RT-08: a route to an internet gateway attached to another VPC is blackhole', () => {
    const status = statusFor((input) => {
      addOtherVpc(input);
      at(input.internetGateways, 0).attachedVpcId = 'vpc-0000000b';
    });
    expect(status.routeTables['rtb-00000002']?.routes[1]?.state).toBe('blackhole');
    expect(status.vpcs['vpc-0000000b']).toEqual({ internetGatewayId: 'igw-0000000a' });
  });

  it('RT-09: a route to an internet gateway of another VPC still makes the subnet public (Inferred, Q8)', () => {
    const status = statusFor((input) => {
      addOtherVpc(input);
      at(input.internetGateways, 0).attachedVpcId = 'vpc-0000000b';
    });
    expect(status.routeTables['rtb-00000002']?.routes[1]?.state).toBe('blackhole');
    expect(status.subnets['subnet-0000000a']?.type).toBe('public');
  });

  it('RT-01: implicit and explicit associations to the main table', () => {
    const status = statusFor((input) => {
      addPrivateSubnet(input);
      input.subnets.push({
        id: 'subnet-0000000c',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.3.0/24',
        availabilityZone: 'us-east-1a',
        routeTableId: 'rtb-00000001',
      });
    });
    expect(status.subnets['subnet-0000000b']).toMatchObject({
      routeTableId: 'rtb-00000001',
      routeTableAssociation: 'main',
    });
    expect(status.subnets['subnet-0000000c']).toMatchObject({
      routeTableId: 'rtb-00000001',
      routeTableAssociation: 'explicit',
    });
    expect(status.routeTables['rtb-00000001']).toMatchObject({
      main: true,
      subnetIds: ['subnet-0000000b', 'subnet-0000000c'],
    });
    expect(status.routeTables['rtb-00000002']).toMatchObject({
      main: false,
      subnetIds: ['subnet-0000000a'],
    });
  });

  it('RT-03: every route table lists the local route first with origin CreateRouteTable', () => {
    const status = statusFor(addOtherVpc);
    for (const [id, table] of Object.entries(status.routeTables)) {
      expect(table.routes[0], id).toMatchObject({
        target: 'local',
        state: 'active',
        origin: 'CreateRouteTable',
      });
    }
    expect(status.routeTables['rtb-0000000b']?.routes).toEqual([
      {
        destinationCidrBlock: '10.1.0.0/16',
        target: 'local',
        state: 'active',
        origin: 'CreateRouteTable',
      },
    ]);
  });

  it('NACL-01: a subnet without an explicit network ACL uses the default one', () => {
    const status = statusFor((input) => {
      addPrivateSubnet(input);
      input.networkAcls.push({
        id: 'acl-0000000b',
        vpcId: 'vpc-0a1b2c3d',
        inboundEntries: [],
        outboundEntries: [],
      });
      at(input.subnets, 1).networkAclId = 'acl-0000000b';
    });
    expect(status.subnets['subnet-0000000a']).toMatchObject({
      networkAclId: 'acl-00000001',
      networkAclAssociation: 'default',
    });
    expect(status.subnets['subnet-0000000b']).toMatchObject({
      networkAclId: 'acl-0000000b',
      networkAclAssociation: 'explicit',
    });
  });

  it('ADR-04: available IPv4 count of a /24 with one instance is 250', () => {
    expect(statusFor().subnets['subnet-0000000a']?.availableIpv4Count).toBe(250);
    const status = statusFor((input) => {
      input.instances.push(extraInstance('0000000b', '10.0.1.11'));
      addPrivateSubnet(input);
      at(input.subnets, 1).cidrBlock = '10.0.2.0/28';
    });
    expect(status.subnets['subnet-0000000a']?.availableIpv4Count).toBe(249);
    expect(status.subnets['subnet-0000000b']?.availableIpv4Count).toBe(11);
  });

  it('EPH-01: client port range follows the platform', () => {
    const status = statusFor((input) => {
      const windows = extraInstance('0000000b', '10.0.1.11');
      windows.platform = 'windows';
      input.instances.push(windows);
    });
    expect(status.instances['i-0000000a']).toEqual({
      publicIpv4Address: '203.0.113.25',
      clientPortRange: { from: 32768, to: 61000 },
    });
    expect(status.instances['i-0000000b']).toEqual({
      publicIpv4Address: null,
      clientPortRange: { from: 49152, to: 65535 },
    });
  });

  it('STATUS: maps follow topology array order', () => {
    const status = statusFor((input) => {
      addOtherVpc(input);
      input.subnets.push({
        id: 'subnet-00000009',
        vpcId: 'vpc-0a1b2c3d',
        cidrBlock: '10.0.9.0/24',
        availabilityZone: 'us-east-1a',
      });
    });
    expect(Object.keys(status.vpcs)).toEqual(['vpc-0a1b2c3d', 'vpc-0000000b']);
    expect(Object.keys(status.subnets)).toEqual([
      'subnet-0000000a',
      'subnet-0000000b',
      'subnet-00000009',
    ]);
    expect(Object.keys(status.routeTables)).toEqual([
      'rtb-00000001',
      'rtb-00000002',
      'rtb-0000000b',
    ]);
    expect(status.routeTables['rtb-00000001']?.subnetIds).toEqual(['subnet-00000009']);
  });
});
