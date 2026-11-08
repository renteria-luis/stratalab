import { topologySchema, type Topology, type TopologyInput } from '@sim/engine';
import { findScenario, lab1Topology } from '@sim/engine/golden';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_RESOURCE_TYPES,
  buildStack,
  logicalIdOf,
  routeLogicalIdOf,
  translationErrors,
} from '../src/cdk/translate';

/** Template.fromStack assertions only (docs/specs/p9-golden.md section 7). */

function template(topology: Topology): Template {
  return Template.fromStack(buildStack(new App(), 'sim-golden-test', topology).stack);
}

function parsed(edit: (input: TopologyInput) => void = () => undefined, fixed = true): Topology {
  const input = lab1Topology(fixed);
  edit(input);
  return topologySchema.parse(input);
}

const codesOf = (topology: Topology) => translationErrors(topology).map((error) => error.code);

function webGroup(input: TopologyInput) {
  const group = input.securityGroups.find((candidate) => candidate.id === 'sg-0000000a');
  if (group === undefined) throw new Error('lab 1 has the web group');
  return group;
}

function web1(input: TopologyInput) {
  const instance = input.instances[0];
  if (instance === undefined) throw new Error('lab 1 has web-1');
  return instance;
}

describe('topology → CDK translation, L1 only', () => {
  it('TRC-06: only allow-listed resource types, no CDK metadata resource, no bootstrap parameter or rule', () => {
    const json = template(parsed()).toJSON() as {
      Resources: Record<string, { Type: string }>;
      Parameters?: Record<string, unknown>;
      Rules?: Record<string, unknown>;
    };
    const types = Object.values(json.Resources).map((resource) => resource.Type);
    for (const type of types) expect(ALLOWED_RESOURCE_TYPES).toContain(type);
    expect(types).not.toContain('AWS::CDK::Metadata');
    expect(json.Parameters?.BootstrapVersion).toBeUndefined();
    expect(json.Rules?.CheckBootstrapVersion).toBeUndefined();
  });

  it('TRC-06: logical IDs come from topology IDs', () => {
    expect(logicalIdOf('vpc-0a1b2c3d')).toBe('Vpc0a1b2c3d');
    expect(logicalIdOf('i-0000000a')).toBe('I0000000a');
    expect(routeLogicalIdOf('rtb-00000002', '198.51.100.0/24')).toBe(
      'Rtb00000002Route198d51d100d0s24',
    );
    const { logicalIds } = buildStack(new App(), 'sim-golden-test', parsed());
    expect(Object.fromEntries(logicalIds)).toEqual({
      Vpc0a1b2c3d: 'vpc-0a1b2c3d',
      Subnet0000000a: 'subnet-0000000a',
      Rtb00000002: 'rtb-00000002',
      Rtb00000002Route0d0d0d0s0: 'rtb-00000002',
      Subnet0000000aRouteTableAssociation: 'subnet-0000000a',
      Igw0000000a: 'igw-0000000a',
      Igw0000000aAttachment: 'igw-0000000a',
      Sg0000000a: 'sg-0000000a',
      I0000000a: 'i-0000000a',
    });
    const resources = template(parsed()).toJSON() as { Resources: Record<string, unknown> };
    expect(Object.keys(resources.Resources).sort()).toEqual([...logicalIds.keys()].sort());
  });

  it('RT-01: the main route table gets no resource and unassociated subnets use it', () => {
    const initial = template(parsed(undefined, false));
    initial.resourceCountIs('AWS::EC2::RouteTable', 1);
    initial.resourceCountIs('AWS::EC2::SubnetRouteTableAssociation', 0);
    const solution = template(parsed());
    solution.hasResourceProperties('AWS::EC2::SubnetRouteTableAssociation', {
      SubnetId: { Ref: 'Subnet0000000a' },
      RouteTableId: { Ref: 'Rtb00000002' },
    });
  });

  it('RT-01: routes in the main table or an explicit main association are rejected', () => {
    expect(
      codesOf(
        parsed((input) => {
          const main = input.routeTables[0];
          if (main === undefined) throw new Error('lab 1 has the main table');
          main.routes = [
            {
              destinationCidrBlock: '0.0.0.0/0',
              target: { type: 'internet-gateway', internetGatewayId: 'igw-0000000a' },
            },
          ];
        }),
      ),
    ).toContain('GOLDEN_MAIN_TABLE_ROUTES');
    expect(
      codesOf(
        parsed((input) => {
          const subnet = input.subnets[0];
          if (subnet === undefined) throw new Error('lab 1 has a subnet');
          subnet.routeTableId = 'rtb-00000001';
        }),
      ),
    ).toContain('GOLDEN_MAIN_TABLE_EXPLICIT');
  });

  it('SG-05: the default group is referenced with GetAtt and must keep its default rules', () => {
    const usingDefault = template(
      parsed((input) => {
        web1(input).primaryNetworkInterface.securityGroupIds = ['sg-00000001'];
      }),
    );
    usingDefault.hasResourceProperties('AWS::EC2::Instance', {
      NetworkInterfaces: [
        Match.objectLike({ GroupSet: [{ 'Fn::GetAtt': ['Vpc0a1b2c3d', 'DefaultSecurityGroup'] }] }),
      ],
    });
    expect(
      codesOf(
        parsed((input) => {
          const group = input.securityGroups[0];
          if (group === undefined) throw new Error('lab 1 has the default group');
          group.inboundRules = [];
        }),
      ),
    ).toContain('GOLDEN_DEFAULT_SG_CHANGED');
  });

  it('SG-05: custom groups always declare their egress rules', () => {
    template(parsed()).hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupName: 'web',
      GroupDescription: 'Allow HTTP',
      VpcId: { Ref: 'Vpc0a1b2c3d' },
      SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 80, ToPort: 80, CidrIp: '0.0.0.0/0' }],
      SecurityGroupEgress: [{ IpProtocol: '-1', CidrIp: '0.0.0.0/0' }],
    });
  });

  it('SG-02: a group without outbound rules is rejected', () => {
    expect(
      codesOf(
        parsed((input) => {
          webGroup(input).outboundRules = [];
        }),
      ),
    ).toContain('GOLDEN_SG_WITHOUT_EGRESS');
  });

  it('SG-04: rules with a group peer become separate rule resources; group-peer egress is rejected', () => {
    const withPeer = template(
      parsed((input) => {
        webGroup(input).inboundRules.push({
          id: 'sgr-0000000c',
          protocol: 'tcp',
          fromPort: 22,
          toPort: 22,
          peer: { type: 'security-group', securityGroupId: 'sg-00000001' },
        });
      }),
    );
    withPeer.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      GroupId: { 'Fn::GetAtt': ['Sg0000000a', 'GroupId'] },
      IpProtocol: 'tcp',
      FromPort: 22,
      ToPort: 22,
      SourceSecurityGroupId: { 'Fn::GetAtt': ['Vpc0a1b2c3d', 'DefaultSecurityGroup'] },
    });
    expect(
      codesOf(
        parsed((input) => {
          webGroup(input).outboundRules.push({
            id: 'sgr-0000000d',
            protocol: 'all',
            peer: { type: 'security-group', securityGroupId: 'sg-00000001' },
          });
        }),
      ),
    ).toContain('GOLDEN_SG_PEER_EGRESS');
  });

  it('NACL-05: the default ACL is referenced through the VPC and must keep rule 100', () => {
    const json = template(parsed());
    json.resourceCountIs('AWS::EC2::NetworkAcl', 0);
    json.resourceCountIs('AWS::EC2::SubnetNetworkAclAssociation', 0);
    expect(
      codesOf(
        parsed((input) => {
          const acl = input.networkAcls[0];
          if (acl === undefined) throw new Error('lab 1 has the default ACL');
          acl.inboundEntries = [];
        }),
      ),
    ).toContain('GOLDEN_DEFAULT_ACL_CHANGED');
  });

  it('NACL-02: entries map protocol, ports, direction and action', () => {
    const json = template(
      parsed((input) => {
        input.networkAcls.push({
          id: 'acl-00000002',
          vpcId: 'vpc-0a1b2c3d',
          inboundEntries: [
            {
              ruleNumber: 100,
              protocol: 'tcp',
              fromPort: 80,
              toPort: 80,
              cidrBlock: '198.51.100.0/24',
              action: 'allow',
            },
            { ruleNumber: 110, protocol: 'all', cidrBlock: '0.0.0.0/0', action: 'deny' },
          ],
          outboundEntries: [
            {
              ruleNumber: 100,
              protocol: 'udp',
              fromPort: 1024,
              toPort: 65535,
              cidrBlock: '0.0.0.0/0',
              action: 'allow',
            },
          ],
        });
        const subnet = input.subnets[0];
        if (subnet === undefined) throw new Error('lab 1 has a subnet');
        subnet.networkAclId = 'acl-00000002';
      }),
    );
    json.hasResourceProperties('AWS::EC2::NetworkAclEntry', {
      NetworkAclId: { Ref: 'Acl00000002' },
      RuleNumber: 100,
      Protocol: 6,
      PortRange: { From: 80, To: 80 },
      RuleAction: 'allow',
      Egress: false,
      CidrBlock: '198.51.100.0/24',
    });
    json.hasResourceProperties('AWS::EC2::NetworkAclEntry', {
      RuleNumber: 110,
      Protocol: -1,
      PortRange: Match.absent(),
      RuleAction: 'deny',
      Egress: false,
    });
    json.hasResourceProperties('AWS::EC2::NetworkAclEntry', {
      RuleNumber: 100,
      Protocol: 17,
      PortRange: { From: 1024, To: 65535 },
      Egress: true,
    });
    json.hasResourceProperties('AWS::EC2::SubnetNetworkAclAssociation', {
      SubnetId: { Ref: 'Subnet0000000a' },
      NetworkAclId: { Ref: 'Acl00000002' },
    });
  });

  it('IGW-05: an attached gateway gets an attachment and its routes depend on it', () => {
    const json = template(parsed());
    json.hasResourceProperties('AWS::EC2::VPCGatewayAttachment', {
      VpcId: { Ref: 'Vpc0a1b2c3d' },
      InternetGatewayId: { Ref: 'Igw0000000a' },
    });
    json.hasResource('AWS::EC2::Route', {
      Properties: {
        RouteTableId: { Ref: 'Rtb00000002' },
        DestinationCidrBlock: '0.0.0.0/0',
        GatewayId: { Ref: 'Igw0000000a' },
      },
      DependsOn: ['Igw0000000aAttachment'],
    });
  });

  it('RT-08: a route to a detached gateway is kept without a dependency (built by the stage plan)', () => {
    const s4 = findScenario('s4-q8-blackhole');
    if (s4 === undefined) throw new Error('s4 is missing');
    const json = template(s4.topology);
    json.hasResource('AWS::EC2::Route', {
      Properties: { DestinationCidrBlock: '198.51.100.0/24', GatewayId: { Ref: 'Igw0000000b' } },
      DependsOn: Match.absent(),
    });
    json.resourceCountIs('AWS::EC2::VPCGatewayAttachment', 1);
  });

  it('ADR-10: an auto-assigned public IP sets AssociatePublicIpAddress and depends on the attachment', () => {
    template(parsed()).hasResource('AWS::EC2::Instance', {
      Properties: {
        NetworkInterfaces: [Match.objectLike({ AssociatePublicIpAddress: true })],
      },
      DependsOn: ['Igw0000000aAttachment'],
    });
    template(
      parsed((input) => {
        delete web1(input).primaryNetworkInterface.publicIp;
      }),
    ).hasResource('AWS::EC2::Instance', {
      Properties: { NetworkInterfaces: [Match.objectLike({ AssociatePublicIpAddress: false })] },
      DependsOn: Match.absent(),
    });
  });

  it('TRC-06: instances are t3.micro with standard credits and the AL2023 parameter', () => {
    template(parsed()).hasResourceProperties('AWS::EC2::Instance', {
      ImageId:
        '{{resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64}}',
      InstanceType: 't3.micro',
      CreditSpecification: { CPUCredits: 'standard' },
      NetworkInterfaces: [
        {
          DeviceIndex: '0',
          SubnetId: { Ref: 'Subnet0000000a' },
          PrivateIpAddress: '10.0.1.10',
          GroupSet: [{ 'Fn::GetAtt': ['Sg0000000a', 'GroupId'] }],
          AssociatePublicIpAddress: true,
          DeleteOnTermination: true,
        },
      ],
    });
  });

  it('TRC-06: resources carry their Name tag and their topology ID', () => {
    template(parsed()).hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
      Tags: Match.arrayWith([
        { Key: 'Name', Value: 'lab-vpc' },
        { Key: 'sim:resource', Value: 'vpc-0a1b2c3d' },
      ]),
    });
  });

  it('TRC-06: windows instances, Elastic IPs and public IPs without an attached gateway are rejected', () => {
    expect(
      codesOf(
        parsed((input) => {
          web1(input).platform = 'windows';
        }),
      ),
    ).toContain('GOLDEN_WINDOWS');
    expect(
      codesOf(
        parsed((input) => {
          web1(input).primaryNetworkInterface.publicIp = {
            kind: 'elastic-ip',
            address: '203.0.113.25',
          };
        }),
      ),
    ).toContain('GOLDEN_ELASTIC_IP');
    expect(
      codesOf(
        parsed((input) => {
          const igw = input.internetGateways[0];
          if (igw === undefined) throw new Error('lab 1 has a gateway');
          delete igw.attachedVpcId;
        }),
      ),
    ).toContain('GOLDEN_PUBLIC_IP_WITHOUT_IGW');
    expect(() =>
      buildStack(
        new App(),
        'sim-golden-test',
        parsed((input) => {
          web1(input).platform = 'windows';
        }),
      ),
    ).toThrow(/GOLDEN_WINDOWS/);
  });
});
