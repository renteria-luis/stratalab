import { describe, expect, it } from 'vitest';
import {
  associateRouteTable,
  attachInternetGateway,
  createInternetGateway,
  createNetworkAcl,
  createRouteTable,
  createSecurityGroup,
  createSubnet,
  createVpc,
  deriveStatus,
  launchInstance,
  newErrors,
  nextId,
  replaceRoutes,
  replaceSecurityGroupRules,
  setMapPublicIpOnLaunch,
  topologySchema,
  trace,
  validate,
  type HelperResult,
  type Topology,
} from '../src/index';
import { baseInput, parseBase } from './fixtures/base';

/** The result of a helper that must succeed. */
function ok<T>(result: HelperResult<T>): { topology: Topology; created: T } {
  if (!result.ok) throw new Error(`Helper failed: ${result.error.code}`);
  return result;
}

function empty(): Topology {
  return topologySchema.parse({
    schemaVersion: 1,
    region: 'us-east-1',
    vpcs: [],
    subnets: [],
    routeTables: [],
    internetGateways: [],
    securityGroups: [],
    networkAcls: [],
    instances: [],
  });
}

/** A VPC 10.0.0.0/16 with one subnet 10.0.1.0/24. */
function vpcWithSubnet(subnetCidr = '10.0.1.0/24') {
  const vpc = ok(createVpc(empty(), { cidrBlock: '10.0.0.0/16', name: 'lab-vpc' }));
  const subnet = ok(
    createSubnet(vpc.topology, { vpcId: vpc.created.vpcId, cidrBlock: subnetCidr }),
  );
  return { topology: subnet.topology, ...vpc.created, subnetId: subnet.created.subnetId };
}

describe('createVpc', () => {
  it('RT-01: create VPC adds a main route table with only the local route', () => {
    const { topology, created } = ok(
      createVpc(empty(), { cidrBlock: '10.0.0.0/16', name: 'lab-vpc' }),
    );
    expect(created).toEqual({
      vpcId: 'vpc-00000001',
      mainRouteTableId: 'rtb-00000001',
      defaultNetworkAclId: 'acl-00000001',
      defaultSecurityGroupId: 'sg-00000001',
    });
    expect(topology.vpcs).toEqual([
      {
        id: 'vpc-00000001',
        name: 'lab-vpc',
        cidrBlock: '10.0.0.0/16',
        mainRouteTableId: 'rtb-00000001',
        defaultNetworkAclId: 'acl-00000001',
        defaultSecurityGroupId: 'sg-00000001',
      },
    ]);
    expect(topology.routeTables).toEqual([
      { id: 'rtb-00000001', vpcId: 'vpc-00000001', routes: [] },
    ]);
    expect(deriveStatus(topology).routeTables['rtb-00000001']).toEqual({
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
    });
  });

  it('NACL-05: create VPC adds a default network ACL that allows all traffic with rule 100', () => {
    const { topology } = ok(createVpc(empty(), { cidrBlock: '10.0.0.0/16' }));
    const allowAll = { ruleNumber: 100, protocol: 'all', cidrBlock: '0.0.0.0/0', action: 'allow' };
    expect(topology.networkAcls).toEqual([
      {
        id: 'acl-00000001',
        vpcId: 'vpc-00000001',
        inboundEntries: [allowAll],
        outboundEntries: [allowAll],
      },
    ]);
  });

  it('SG-05: create VPC adds the default security group', () => {
    const { topology } = ok(createVpc(empty(), { cidrBlock: '10.0.0.0/16' }));
    expect(topology.securityGroups).toEqual([
      {
        id: 'sg-00000001',
        vpcId: 'vpc-00000001',
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
    ]);
  });

  it('ADR-05: create VPC stores the CIDR in canonical form', () => {
    const { topology } = ok(createVpc(empty(), { cidrBlock: '10.0.1.7/16' }));
    expect(topology.vpcs[0]?.cidrBlock).toBe('10.0.0.0/16');
  });

  it('HELPERS: a new VPC has no validate() issues and no Name tag unless given', () => {
    const { topology } = ok(createVpc(empty(), { cidrBlock: '10.0.0.0/16', name: '' }));
    expect(validate(topology)).toEqual([]);
    expect(topology.vpcs[0]).not.toHaveProperty('name');
  });

  it('HELPERS: an invalid CIDR gives INVALID_INPUT', () => {
    const result = createVpc(empty(), { cidrBlock: '10.0.0.0/33' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_INPUT');
    expect(result.error.issues?.map((issue) => issue.path)).toEqual([['vpcs', 0, 'cidrBlock']]);
  });
});

describe('createSubnet', () => {
  it('RT-01: a new subnet uses the main route table implicitly', () => {
    const { topology, subnetId, mainRouteTableId } = vpcWithSubnet();
    expect(topology.subnets[0]).not.toHaveProperty('routeTableId');
    expect(deriveStatus(topology).subnets[subnetId]).toMatchObject({
      routeTableId: mainRouteTableId,
      routeTableAssociation: 'main',
    });
  });

  it('NACL-01: a new subnet uses the default network ACL', () => {
    const { topology, subnetId, defaultNetworkAclId } = vpcWithSubnet();
    expect(topology.subnets[0]).not.toHaveProperty('networkAclId');
    expect(deriveStatus(topology).subnets[subnetId]).toMatchObject({
      networkAclId: defaultNetworkAclId,
      networkAclAssociation: 'default',
    });
  });

  it('ADR-10: a new subnet does not map public IPv4 addresses on launch', () => {
    const { topology } = vpcWithSubnet();
    expect(topology.subnets[0]?.mapPublicIpOnLaunch).toBe(false);
  });

  it('HELPERS: "No preference" picks the first zone of the region; a chosen zone is kept', () => {
    const { topology, vpcId } = vpcWithSubnet();
    expect(topology.subnets[0]?.availabilityZone).toBe('us-east-1a');
    const second = ok(
      createSubnet(topology, {
        vpcId,
        cidrBlock: '10.0.2.0/24',
        availabilityZone: 'us-east-1b',
        name: 'private-b',
      }),
    );
    expect(second.topology.subnets[1]).toEqual({
      id: 'subnet-00000002',
      name: 'private-b',
      vpcId,
      cidrBlock: '10.0.2.0/24',
      availabilityZone: 'us-east-1b',
      mapPublicIpOnLaunch: false,
    });
  });

  it('HELPERS: an unknown VPC gives UNKNOWN_REFERENCE', () => {
    const result = createSubnet(empty(), { vpcId: 'vpc-00000009', cidrBlock: '10.0.1.0/24' });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'UNKNOWN_REFERENCE',
        ruleIds: [],
        params: { referenceType: 'vpc', id: 'vpc-00000009' },
      },
    });
  });
});

describe('createRouteTable, createInternetGateway, createSecurityGroup, createNetworkAcl', () => {
  it('RT-12: a new route table has only the local route and no associations', () => {
    const { topology, vpcId, subnetId, mainRouteTableId } = vpcWithSubnet();
    const { topology: after, created } = ok(createRouteTable(topology, { vpcId, name: 'public' }));
    expect(created).toEqual({ routeTableId: 'rtb-00000002' });
    expect(after.routeTables[1]).toEqual({
      id: 'rtb-00000002',
      name: 'public',
      vpcId,
      routes: [],
    });
    const status = deriveStatus(after);
    expect(status.routeTables['rtb-00000002']).toMatchObject({ main: false, subnetIds: [] });
    expect(status.subnets[subnetId]?.routeTableId).toBe(mainRouteTableId);
  });

  it('IGW-05: a new internet gateway is detached', () => {
    const { topology, vpcId } = vpcWithSubnet();
    const { topology: after, created } = ok(createInternetGateway(topology, { name: 'lab-igw' }));
    expect(created).toEqual({ internetGatewayId: 'igw-00000001' });
    expect(after.internetGateways).toEqual([{ id: 'igw-00000001', name: 'lab-igw' }]);
    const status = deriveStatus(after);
    expect(status.internetGateways['igw-00000001']).toEqual({ state: 'detached' });
    expect(status.vpcs[vpcId]).toEqual({ internetGatewayId: null });
  });

  it('SG-05: a new security group has no inbound rules and one outbound rule that allows all traffic', () => {
    const { topology, vpcId } = vpcWithSubnet();
    const { topology: after, created } = ok(
      createSecurityGroup(topology, { vpcId, name: 'web', description: 'Allow HTTP' }),
    );
    expect(created).toEqual({ securityGroupId: 'sg-00000002' });
    expect(after.securityGroups[1]).toEqual({
      id: 'sg-00000002',
      vpcId,
      name: 'web',
      description: 'Allow HTTP',
      inboundRules: [],
      outboundRules: [
        { id: 'sgr-00000003', protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
      ],
    });
  });

  it('NACL-05: a new network ACL has no numbered entries and no associations', () => {
    const { topology, vpcId, subnetId, defaultNetworkAclId } = vpcWithSubnet();
    const { topology: after, created } = ok(createNetworkAcl(topology, { vpcId }));
    expect(created).toEqual({ networkAclId: 'acl-00000002' });
    expect(after.networkAcls[1]).toEqual({
      id: 'acl-00000002',
      vpcId,
      inboundEntries: [],
      outboundEntries: [],
    });
    expect(deriveStatus(after).subnets[subnetId]?.networkAclId).toBe(defaultNetworkAclId);
  });
});

describe('launchInstance', () => {
  it('ADR-09: launch picks the first usable address of the subnet', () => {
    const { topology, subnetId } = vpcWithSubnet();
    const { topology: after, created } = ok(
      launchInstance(topology, { subnetId, platform: 'linux', name: 'web-1' }),
    );
    expect(created).toEqual({ instanceId: 'i-00000001', networkInterfaceId: 'eni-00000001' });
    expect(after.instances).toEqual([
      {
        id: 'i-00000001',
        name: 'web-1',
        platform: 'linux',
        primaryNetworkInterface: {
          id: 'eni-00000001',
          subnetId,
          privateIpAddress: '10.0.1.4',
          securityGroupIds: ['sg-00000001'],
        },
        runningServices: [],
      },
    ]);
  });

  it('ADR-04: launch skips addresses other interfaces in the VPC use', () => {
    const { topology, subnetId } = vpcWithSubnet();
    const first = ok(
      launchInstance(topology, { subnetId, platform: 'linux', privateIpAddress: '10.0.1.4' }),
    );
    const second = ok(launchInstance(first.topology, { subnetId, platform: 'windows' }));
    expect(second.topology.instances[1]?.primaryNetworkInterface.privateIpAddress).toBe('10.0.1.5');
  });

  it('ADR-04: a full subnet gives NO_FREE_PRIVATE_ADDRESS', () => {
    // A /28 has 16 addresses, 5 reserved: 11 usable (.4 to .14).
    let { topology } = vpcWithSubnet('10.0.1.0/28');
    const subnetId = topology.subnets[0]?.id ?? '';
    for (let i = 0; i < 11; i += 1) {
      topology = ok(launchInstance(topology, { subnetId, platform: 'linux' })).topology;
    }
    expect(topology.instances.at(-1)?.primaryNetworkInterface.privateIpAddress).toBe('10.0.1.14');
    expect(launchInstance(topology, { subnetId, platform: 'linux' })).toEqual({
      ok: false,
      error: {
        code: 'NO_FREE_PRIVATE_ADDRESS',
        ruleIds: ['ADR-09', 'ADR-04'],
        params: { subnetId, cidrBlock: '10.0.1.0/28' },
      },
    });
  });

  it('ADR-09: a chosen private address is kept', () => {
    const { topology, subnetId } = vpcWithSubnet();
    const { topology: after } = ok(
      launchInstance(topology, { subnetId, platform: 'linux', privateIpAddress: '10.0.1.10' }),
    );
    expect(after.instances[0]?.primaryNetworkInterface.privateIpAddress).toBe('10.0.1.10');
  });

  it('ADR-10: a subnet that does not map public IPs gives no public address', () => {
    const { topology, subnetId } = vpcWithSubnet();
    const { topology: after } = ok(launchInstance(topology, { subnetId, platform: 'linux' }));
    expect(after.instances[0]?.primaryNetworkInterface).not.toHaveProperty('publicIp');
  });

  it('ADR-10: launch assigns a public address when the subnet maps public IPs on launch', () => {
    const { topology, subnetId } = vpcWithSubnet();
    const mapped = ok(setMapPublicIpOnLaunch(topology, subnetId, true)).topology;
    const { topology: after } = ok(launchInstance(mapped, { subnetId, platform: 'linux' }));
    expect(after.instances[0]?.primaryNetworkInterface.publicIp).toEqual({
      kind: 'auto-assigned',
      address: '203.0.113.1',
    });
  });

  it('ADR-10: the launch setting overrides the subnet attribute', () => {
    const { topology, subnetId } = vpcWithSubnet();
    const on = ok(
      launchInstance(topology, { subnetId, platform: 'linux', autoAssignPublicIp: true }),
    );
    expect(on.topology.instances[0]?.primaryNetworkInterface.publicIp?.address).toBe('203.0.113.1');
    const mapped = ok(setMapPublicIpOnLaunch(topology, subnetId, true)).topology;
    const off = ok(
      launchInstance(mapped, { subnetId, platform: 'linux', autoAssignPublicIp: false }),
    );
    expect(off.topology.instances[0]?.primaryNetworkInterface).not.toHaveProperty('publicIp');
  });

  it('ADR-10: the public pool skips used addresses and VPC CIDRs', () => {
    // A public VPC CIDR is allowed (ADR-01); its addresses can't be public addresses.
    const vpc = ok(createVpc(empty(), { cidrBlock: '203.0.113.0/28' }));
    const subnet = ok(
      createSubnet(vpc.topology, { vpcId: vpc.created.vpcId, cidrBlock: '203.0.113.0/28' }),
    );
    const subnetId = subnet.created.subnetId;
    const first = ok(
      launchInstance(subnet.topology, { subnetId, platform: 'linux', autoAssignPublicIp: true }),
    );
    const second = ok(
      launchInstance(first.topology, { subnetId, platform: 'linux', autoAssignPublicIp: true }),
    );
    expect(
      second.topology.instances.map(
        (instance) => instance.primaryNetworkInterface.publicIp?.address,
      ),
    ).toEqual(['203.0.113.16', '203.0.113.17']);
  });

  it('ADR-10: an exhausted pool gives PUBLIC_POOL_EXHAUSTED', () => {
    const { topology, subnetId } = vpcWithSubnet();
    const covering = ok(createVpc(topology, { cidrBlock: '203.0.113.0/24' })).topology;
    expect(
      launchInstance(covering, { subnetId, platform: 'linux', autoAssignPublicIp: true }),
    ).toEqual({
      ok: false,
      error: {
        code: 'PUBLIC_POOL_EXHAUSTED',
        ruleIds: ['ADR-10'],
        params: { pool: '203.0.113.0/24' },
      },
    });
  });

  it('SG-05: launch without security groups uses the VPC default group; chosen groups are kept', () => {
    const { topology, vpcId, subnetId } = vpcWithSubnet();
    const web = ok(createSecurityGroup(topology, { vpcId, name: 'web', description: 'web' }));
    const withNone = ok(
      launchInstance(web.topology, { subnetId, platform: 'linux', securityGroupIds: [] }),
    );
    expect(withNone.topology.instances[0]?.primaryNetworkInterface.securityGroupIds).toEqual([
      'sg-00000001',
    ]);
    const withWeb = ok(
      launchInstance(web.topology, {
        subnetId,
        platform: 'linux',
        securityGroupIds: [web.created.securityGroupId],
      }),
    );
    expect(withWeb.topology.instances[0]?.primaryNetworkInterface.securityGroupIds).toEqual([
      'sg-00000002',
    ]);
  });

  it('HELPERS: unknown subnets and security groups give UNKNOWN_REFERENCE', () => {
    const { topology, subnetId } = vpcWithSubnet();
    expect(launchInstance(topology, { subnetId: 'subnet-0000ffff', platform: 'linux' })).toEqual({
      ok: false,
      error: {
        code: 'UNKNOWN_REFERENCE',
        ruleIds: [],
        params: { referenceType: 'subnet', id: 'subnet-0000ffff' },
      },
    });
    const result = launchInstance(topology, {
      subnetId,
      platform: 'linux',
      securityGroupIds: ['sg-0000ffff'],
    });
    expect(result.ok ? null : result.error.params).toEqual({
      referenceType: 'security-group',
      id: 'sg-0000ffff',
    });
  });
});

describe('IDs', () => {
  it('HELPERS: IDs continue after the largest existing ID of the same prefix', () => {
    const base = parseBase();
    expect(nextId(base, 'vpc')).toBe('vpc-0a1b2c3e');
    expect(nextId(base, 'sgr')).toBe('sgr-0000000c');
    expect(nextId(base, 'i')).toBe('i-0000000b');
    expect(nextId(base, 'igw')).toBe('igw-0000000b');
    expect(nextId(base, 'eni')).toBe('eni-0000000b');
    expect(nextId(empty(), 'subnet')).toBe('subnet-00000001');
  });

  it('HELPERS: when the next value needs more than 17 hex characters, the smallest unused value is used', () => {
    const renamed = JSON.stringify(baseInput()).replaceAll('vpc-0a1b2c3d', 'vpc-fffffffffffffffff');
    const topology = topologySchema.parse(JSON.parse(renamed));
    expect(nextId(topology, 'vpc')).toBe('vpc-00000001');
  });

  it('HELPERS: the same calls give the same IDs', () => {
    const run = () => buildLabSolution().topology;
    expect(run()).toEqual(run());
  });

  it('HELPERS: helpers never mutate their input', () => {
    const before = vpcWithSubnet().topology;
    const snapshot = JSON.stringify(before);
    createRouteTable(before, { vpcId: 'vpc-00000001' });
    launchInstance(before, { subnetId: 'subnet-00000001', platform: 'linux' });
    createVpc(before, { cidrBlock: '10.1.0.0/16' });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('newErrors', () => {
  it('HELPERS: newErrors returns only errors the change introduced', () => {
    const { topology, vpcId } = vpcWithSubnet();
    const overlap = ok(createSubnet(topology, { vpcId, cidrBlock: '10.0.1.0/25' })).topology;
    expect(newErrors(topology, overlap).map((issue) => issue.code)).toContain('CIDR_OVERLAP');
    const unrelated = ok(createInternetGateway(overlap, {})).topology;
    expect(newErrors(overlap, unrelated)).toEqual([]);
  });
});

/** Lab 1 solution (r0-engine.md 3.9) built with the console steps. */
function buildLabSolution() {
  const steps: { name: string; before: Topology; after: Topology }[] = [];
  let topology = empty();
  const apply = <T>(name: string, result: HelperResult<T>): T => {
    const { topology: after, created } = ok(result);
    steps.push({ name, before: topology, after });
    topology = after;
    return created;
  };

  const { vpcId } = apply(
    'vpc',
    createVpc(topology, { cidrBlock: '10.0.0.0/16', name: 'lab-vpc' }),
  );
  const { subnetId } = apply(
    'subnet',
    createSubnet(topology, { vpcId, cidrBlock: '10.0.1.0/24', name: 'public-a' }),
  );
  apply('map public IPs', setMapPublicIpOnLaunch(topology, subnetId, true));
  const { internetGatewayId } = apply('igw', createInternetGateway(topology, {}));
  apply('attach', attachInternetGateway(topology, internetGatewayId, vpcId));
  const { routeTableId } = apply('rtb', createRouteTable(topology, { vpcId, name: 'public-rt' }));
  apply(
    'routes',
    replaceRoutes(topology, routeTableId, [
      {
        destinationCidrBlock: '0.0.0.0/0',
        target: { type: 'internet-gateway', internetGatewayId },
      },
    ]),
  );
  apply('associate', associateRouteTable(topology, subnetId, routeTableId));
  const { securityGroupId } = apply(
    'sg',
    createSecurityGroup(topology, { vpcId, name: 'web', description: 'Allow HTTP' }),
  );
  apply(
    'rules',
    replaceSecurityGroupRules(topology, securityGroupId, 'inbound', [
      { protocol: 'tcp', fromPort: 80, toPort: 80, peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
    ]),
  );
  const { instanceId } = apply(
    'launch',
    launchInstance(topology, {
      subnetId,
      platform: 'linux',
      name: 'web-1',
      securityGroupIds: [securityGroupId],
      runningServices: [
        { protocol: 'tcp', port: 80, name: 'nginx', responseHtml: '<h1>It works</h1>' },
      ],
    }),
  );
  return { topology, steps, instanceId };
}

describe('lab 1 through the console helpers', () => {
  it('HELPERS: console steps build the lab 1 solution', () => {
    const { topology, steps, instanceId } = buildLabSolution();
    for (const step of steps) {
      expect(newErrors(step.before, step.after), step.name).toEqual([]);
    }
    expect(validate(topology)).toEqual([]);
    const result = trace(topology, {
      protocol: 'tcp',
      source: { type: 'internet', ipAddress: '198.51.100.7' },
      destination: { type: 'instance', instanceId, address: 'public' },
      destinationPort: 80,
    });
    expect(result.status === 'evaluated' ? result.verdict : result.status).toBe('REACHED');
  });
});
