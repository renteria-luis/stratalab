import type { NetworkAclEntry, SecurityGroupRule, Topology } from '@sim/engine';
import { canonicalJson } from '@sim/engine/golden';
import {
  App,
  DefaultStackSynthesizer,
  Stack,
  type CfnResource,
  Validations,
  type CfnTag,
} from 'aws-cdk-lib';
import {
  CfnInstance,
  CfnInternetGateway,
  CfnNetworkAcl,
  CfnNetworkAclEntry,
  CfnRoute,
  CfnRouteTable,
  CfnSecurityGroup,
  CfnSecurityGroupIngress,
  CfnSubnet,
  CfnSubnetNetworkAclAssociation,
  CfnSubnetRouteTableAssociation,
  CfnVPC,
  CfnVPCGatewayAttachment,
} from 'aws-cdk-lib/aws-ec2';

/**
 * Topology → CloudFormation with L1 (`Cfn*`) constructs only, so CDK adds nothing the topology
 * doesn't have (docs/specs/p9-golden.md section 7). Defaults CloudFormation and EC2 add, and
 * the mismatches with our model, are in section 7.1; the translator rejects what it can't
 * build faithfully instead of approximating it.
 *
 * Rules: RT-01, SG-05, NACL-05, IGW-05, ADR-10 ·
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-vpc.html ·
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-securitygroup.html ·
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-instance.html
 */

export const ALLOWED_RESOURCE_TYPES = [
  'AWS::EC2::VPC',
  'AWS::EC2::Subnet',
  'AWS::EC2::RouteTable',
  'AWS::EC2::Route',
  'AWS::EC2::SubnetRouteTableAssociation',
  'AWS::EC2::InternetGateway',
  'AWS::EC2::VPCGatewayAttachment',
  'AWS::EC2::SecurityGroup',
  'AWS::EC2::SecurityGroupIngress',
  'AWS::EC2::NetworkAcl',
  'AWS::EC2::NetworkAclEntry',
  'AWS::EC2::SubnetNetworkAclAssociation',
  'AWS::EC2::Instance',
] as const;

/** Amazon Linux 2023 x86_64 through the public SSM parameter (D6). */
export const AMI_PARAMETER =
  '{{resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64}}';
export const INSTANCE_TYPE = 't3.micro';

export interface TranslateError {
  readonly code:
    | 'GOLDEN_MAIN_TABLE_ROUTES'
    | 'GOLDEN_MAIN_TABLE_EXPLICIT'
    | 'GOLDEN_DEFAULT_SG_CHANGED'
    | 'GOLDEN_DEFAULT_ACL_CHANGED'
    | 'GOLDEN_SG_WITHOUT_EGRESS'
    | 'GOLDEN_SG_PEER_EGRESS'
    | 'GOLDEN_WINDOWS'
    | 'GOLDEN_ELASTIC_IP'
    | 'GOLDEN_PUBLIC_IP_WITHOUT_IGW'
    | 'GOLDEN_NAT_GATEWAY';
  readonly message: string;
}

export interface Translation {
  readonly stack: Stack;
  /** Logical ID → the topology ID it was built from. */
  readonly logicalIds: ReadonlyMap<string, string>;
}

/**
 * A route's logical ID comes from its destination (`0.0.0.0/0` → `Route0d0d0d0s0`), never its
 * position, so it stays the same across stages and CloudFormation never replaces it
 * (RT-11 keeps destinations unique per table).
 */
export function routeLogicalIdOf(routeTableId: string, destinationCidrBlock: string): string {
  return `${logicalIdOf(routeTableId)}Route${destinationCidrBlock.replaceAll('.', 'd').replace('/', 's')}`;
}

/** `vpc-0a1b2c3d` → `Vpc0a1b2c3d`. */
export function logicalIdOf(topologyId: string): string {
  const [prefix = '', rest = ''] = topologyId.split('-', 2);
  return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}${rest}`;
}

const DEFAULT_ALLOW_ALL = {
  ruleNumber: 100,
  protocol: 'all',
  cidrBlock: '0.0.0.0/0',
  action: 'allow',
};

function hasDefaultEntries(entries: readonly NetworkAclEntry[]) {
  return canonicalJson(entries) === canonicalJson([DEFAULT_ALLOW_ALL]);
}

/** A rule without its ID, which AWS assigns. */
const withoutId = (rule: SecurityGroupRule) =>
  Object.fromEntries(Object.entries(rule).filter(([key]) => key !== 'id'));

export function translationErrors(topology: Topology): TranslateError[] {
  const errors: TranslateError[] = [];
  const attachedVpcs = new Set(
    topology.internetGateways.flatMap((gateway) => gateway.attachedVpcId ?? []),
  );

  // NAT gateways bill per hour and need a P9 spec update first (r1-nat-gateway.md section 6).
  for (const nat of topology.natGateways ?? []) {
    errors.push({
      code: 'GOLDEN_NAT_GATEWAY',
      message: `${nat.id}: golden scenarios don't support NAT gateways yet (NAT-01)`,
    });
  }

  for (const vpc of topology.vpcs) {
    const main = topology.routeTables.find((table) => table.id === vpc.mainRouteTableId);
    if (main !== undefined && main.routes.length > 0) {
      errors.push({
        code: 'GOLDEN_MAIN_TABLE_ROUTES',
        message: `${main.id}: CloudFormation can't reach the main route table, so it can't have routes (RT-01)`,
      });
    }
    const defaultGroup = topology.securityGroups.find(
      (group) => group.id === vpc.defaultSecurityGroupId,
    );
    if (
      defaultGroup !== undefined &&
      (canonicalJson(defaultGroup.inboundRules.map(withoutId)) !==
        canonicalJson([
          { protocol: 'all', peer: { type: 'security-group', securityGroupId: defaultGroup.id } },
        ]) ||
        canonicalJson(defaultGroup.outboundRules.map(withoutId)) !==
          canonicalJson([{ protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } }]))
    ) {
      errors.push({
        code: 'GOLDEN_DEFAULT_SG_CHANGED',
        message: `${defaultGroup.id}: the default security group must keep its default rules (SG-05)`,
      });
    }
    const defaultAcl = topology.networkAcls.find((acl) => acl.id === vpc.defaultNetworkAclId);
    if (
      defaultAcl !== undefined &&
      (!hasDefaultEntries(defaultAcl.inboundEntries) ||
        !hasDefaultEntries(defaultAcl.outboundEntries))
    ) {
      errors.push({
        code: 'GOLDEN_DEFAULT_ACL_CHANGED',
        message: `${defaultAcl.id}: the default network ACL must keep rule 100 allow all (NACL-05)`,
      });
    }
  }

  for (const subnet of topology.subnets) {
    const vpc = topology.vpcs.find((candidate) => candidate.id === subnet.vpcId);
    if (subnet.routeTableId !== undefined && subnet.routeTableId === vpc?.mainRouteTableId) {
      errors.push({
        code: 'GOLDEN_MAIN_TABLE_EXPLICIT',
        message: `${subnet.id}: CloudFormation can't associate a subnet with the main route table explicitly (RT-01)`,
      });
    }
  }

  const defaultGroups = new Set(topology.vpcs.map((vpc) => vpc.defaultSecurityGroupId));
  for (const group of topology.securityGroups) {
    if (defaultGroups.has(group.id)) continue;
    if (group.outboundRules.length === 0) {
      errors.push({
        code: 'GOLDEN_SG_WITHOUT_EGRESS',
        message: `${group.id}: CloudFormation adds allow-all egress to a group without egress rules (SG-02, SG-05)`,
      });
    }
    if (group.outboundRules.some((rule) => rule.peer.type === 'security-group')) {
      errors.push({
        code: 'GOLDEN_SG_PEER_EGRESS',
        message: `${group.id}: outbound rules with a security group peer aren't supported in R0 golden`,
      });
    }
  }

  for (const instance of topology.instances) {
    const nic = instance.primaryNetworkInterface;
    if (instance.platform !== 'linux') {
      errors.push({
        code: 'GOLDEN_WINDOWS',
        message: `${instance.id}: only linux instances are deployed`,
      });
    }
    if (nic.publicIp?.kind === 'elastic-ip') {
      errors.push({
        code: 'GOLDEN_ELASTIC_IP',
        message: `${instance.id}: Elastic IP addresses aren't deployed`,
      });
    }
    const subnet = topology.subnets.find((candidate) => candidate.id === nic.subnetId);
    if (nic.publicIp !== undefined && subnet !== undefined && !attachedVpcs.has(subnet.vpcId)) {
      errors.push({
        code: 'GOLDEN_PUBLIC_IP_WITHOUT_IGW',
        message: `${instance.id}: a public IPv4 address in a VPC without an attached gateway is open (Q11)`,
      });
    }
  }
  return errors;
}

function tagsOf(topologyId: string, name?: string): CfnTag[] {
  return [
    ...(name === undefined ? [] : [{ key: 'Name', value: name }]),
    { key: 'sim:resource', value: topologyId },
  ];
}

const IP_PROTOCOL = { tcp: 'tcp', udp: 'udp', icmp: 'icmp', all: '-1' } as const;
const ACL_PROTOCOL = { tcp: 6, udp: 17, icmp: 1, all: -1 } as const;

function ruleParts(rule: SecurityGroupRule) {
  const description = rule.description === undefined ? {} : { description: rule.description };
  switch (rule.protocol) {
    case 'tcp':
    case 'udp':
      return {
        ipProtocol: IP_PROTOCOL[rule.protocol],
        fromPort: rule.fromPort,
        toPort: rule.toPort,
        ...description,
      };
    case 'icmp':
      return {
        ipProtocol: 'icmp',
        fromPort: rule.icmpType ?? -1,
        toPort: rule.icmpCode ?? -1,
        ...description,
      };
    case 'all':
      return { ipProtocol: '-1', ...description };
  }
}

function aclParts(entry: NetworkAclEntry) {
  switch (entry.protocol) {
    case 'tcp':
    case 'udp':
      return {
        protocol: ACL_PROTOCOL[entry.protocol],
        portRange: { from: entry.fromPort, to: entry.toPort },
      };
    case 'icmp':
      return { protocol: 1, icmp: { type: entry.icmpType ?? -1, code: entry.icmpCode ?? -1 } };
    case 'all':
      return { protocol: -1 };
  }
}

/** Builds the stack under `app`. Throws if `translationErrors` isn't empty. */
export function buildStack(app: App, stackName: string, topology: Topology): Translation {
  const errors = translationErrors(topology);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => `${error.code}: ${error.message}`).join('\n'));
  }
  const stack = new Stack(app, stackName, {
    stackName,
    analyticsReporting: false,
    synthesizer: new DefaultStackSynthesizer({ generateBootstrapVersionRule: false }),
  });
  const logicalIds = new Map<string, string>();
  const add = <T extends CfnResource>(
    logicalId: string,
    topologyId: string,
    make: (id: string) => T,
  ): T => {
    const resource = make(logicalId);
    resource.overrideLogicalId(logicalId);
    logicalIds.set(logicalId, topologyId);
    return resource;
  };

  const vpcs = new Map<string, CfnVPC>();
  for (const vpc of topology.vpcs) {
    vpcs.set(
      vpc.id,
      add(
        logicalIdOf(vpc.id),
        vpc.id,
        (id) => new CfnVPC(stack, id, { cidrBlock: vpc.cidrBlock, tags: tagsOf(vpc.id, vpc.name) }),
      ),
    );
  }
  const vpcOf = (id: string) => {
    const resource = vpcs.get(id);
    if (resource === undefined) throw new Error(`unknown VPC ${id}`);
    return resource;
  };
  const mainTables = new Set(topology.vpcs.map((vpc) => vpc.mainRouteTableId));
  const defaultAcls = new Map(topology.vpcs.map((vpc) => [vpc.defaultNetworkAclId, vpc.id]));
  const defaultGroups = new Map(topology.vpcs.map((vpc) => [vpc.defaultSecurityGroupId, vpc.id]));

  const attachments = new Map<string, CfnVPCGatewayAttachment>();
  const gateways = new Map<string, CfnInternetGateway>();
  for (const gateway of topology.internetGateways) {
    const resource = add(
      logicalIdOf(gateway.id),
      gateway.id,
      (id) => new CfnInternetGateway(stack, id, { tags: tagsOf(gateway.id, gateway.name) }),
    );
    gateways.set(gateway.id, resource);
    if (gateway.attachedVpcId !== undefined) {
      const vpc = vpcOf(gateway.attachedVpcId);
      attachments.set(
        gateway.id,
        add(
          `${logicalIdOf(gateway.id)}Attachment`,
          gateway.id,
          (id) =>
            new CfnVPCGatewayAttachment(stack, id, {
              vpcId: vpc.ref,
              internetGatewayId: resource.ref,
            }),
        ),
      );
    }
  }
  const attachedGatewayOf = (vpcId: string) =>
    topology.internetGateways.find((gateway) => gateway.attachedVpcId === vpcId)?.id;

  const tables = new Map<string, CfnRouteTable>();
  for (const table of topology.routeTables) {
    if (mainTables.has(table.id)) continue;
    const resource = add(
      logicalIdOf(table.id),
      table.id,
      (id) =>
        new CfnRouteTable(stack, id, {
          vpcId: vpcOf(table.vpcId).ref,
          tags: tagsOf(table.id, table.name),
        }),
    );
    tables.set(table.id, resource);
    for (const route of table.routes) {
      // translationErrors rejects NAT gateways, so every route here targets an internet gateway.
      if (route.target.type !== 'internet-gateway')
        throw new Error(`${table.id}: unexpected target`);
      const gatewayId = route.target.internetGatewayId;
      const gateway = gateways.get(gatewayId);
      if (gateway === undefined) throw new Error(`unknown internet gateway ${gatewayId}`);
      const routeResource = add(
        routeLogicalIdOf(table.id, route.destinationCidrBlock),
        table.id,
        (id) =>
          new CfnRoute(stack, id, {
            routeTableId: resource.ref,
            destinationCidrBlock: route.destinationCidrBlock,
            gatewayId: gateway.ref,
          }),
      );
      const attachment = attachments.get(gatewayId);
      if (attachment !== undefined) routeResource.addResourceDependency(attachment);
    }
  }

  const acls = new Map<string, string>();
  for (const acl of topology.networkAcls) {
    const defaultFor = defaultAcls.get(acl.id);
    if (defaultFor !== undefined) {
      acls.set(acl.id, vpcOf(defaultFor).attrDefaultNetworkAcl);
      continue;
    }
    const resource = add(
      logicalIdOf(acl.id),
      acl.id,
      (id) =>
        new CfnNetworkAcl(stack, id, {
          vpcId: vpcOf(acl.vpcId).ref,
          tags: tagsOf(acl.id, acl.name),
        }),
    );
    acls.set(acl.id, resource.ref);
    for (const [entries, egress, label] of [
      [acl.inboundEntries, false, 'In'],
      [acl.outboundEntries, true, 'Out'],
    ] as const) {
      for (const entry of entries) {
        add(
          `${logicalIdOf(acl.id)}${label}${String(entry.ruleNumber)}`,
          acl.id,
          (id) =>
            new CfnNetworkAclEntry(stack, id, {
              networkAclId: resource.ref,
              ruleNumber: entry.ruleNumber,
              ruleAction: entry.action,
              egress,
              cidrBlock: entry.cidrBlock,
              ...aclParts(entry),
            }),
        );
      }
    }
  }

  const groups = new Map<string, string>();
  for (const group of topology.securityGroups) {
    const defaultFor = defaultGroups.get(group.id);
    if (defaultFor !== undefined) groups.set(group.id, vpcOf(defaultFor).attrDefaultSecurityGroup);
  }
  const groupResources = new Map<string, CfnSecurityGroup>();
  for (const group of topology.securityGroups) {
    if (defaultGroups.has(group.id)) continue;
    const cidrRules = (rules: readonly SecurityGroupRule[]) =>
      rules.flatMap((rule) =>
        rule.peer.type === 'cidr' ? [{ ...ruleParts(rule), cidrIp: rule.peer.cidrBlock }] : [],
      );
    const resource = add(
      logicalIdOf(group.id),
      group.id,
      (id) =>
        new CfnSecurityGroup(stack, id, {
          groupName: group.name,
          groupDescription: group.description,
          vpcId: vpcOf(group.vpcId).ref,
          securityGroupIngress: cidrRules(group.inboundRules),
          // Always explicit: without egress rules CloudFormation adds allow-all IPv4 and IPv6.
          securityGroupEgress: cidrRules(group.outboundRules),
          tags: tagsOf(group.id),
        }),
    );
    groupResources.set(group.id, resource);
    groups.set(group.id, resource.attrGroupId);
  }
  const groupRef = (id: string) => {
    const ref = groups.get(id);
    if (ref === undefined) throw new Error(`unknown security group ${id}`);
    return ref;
  };
  // Rules with a group peer are separate resources, or groups that reference each other
  // would form a circular dependency (AWS::EC2::SecurityGroup docs).
  for (const [groupId, resource] of groupResources) {
    const group = topology.securityGroups.find((candidate) => candidate.id === groupId);
    for (const rule of group?.inboundRules ?? []) {
      if (rule.peer.type !== 'security-group') continue;
      add(
        `${logicalIdOf(groupId)}Ingress${logicalIdOf(rule.id)}`,
        groupId,
        (id) =>
          new CfnSecurityGroupIngress(stack, id, {
            groupId: resource.attrGroupId,
            sourceSecurityGroupId: groupRef(
              rule.peer.type === 'security-group' ? rule.peer.securityGroupId : '',
            ),
            ...ruleParts(rule),
          }),
      );
    }
  }

  const subnets = new Map<string, CfnSubnet>();
  for (const subnet of topology.subnets) {
    const resource = add(
      logicalIdOf(subnet.id),
      subnet.id,
      (id) =>
        new CfnSubnet(stack, id, {
          vpcId: vpcOf(subnet.vpcId).ref,
          cidrBlock: subnet.cidrBlock,
          availabilityZone: subnet.availabilityZone,
          mapPublicIpOnLaunch: subnet.mapPublicIpOnLaunch,
          tags: tagsOf(subnet.id, subnet.name),
        }),
    );
    // The topology names the zone on purpose; it must not move between captures.
    Validations.of(resource).acknowledge({
      id: 'CloudFormation-Validate::W3010',
      reason: 'The golden topology fixes the Availability Zone',
    });
    subnets.set(subnet.id, resource);
    const table = subnet.routeTableId === undefined ? undefined : tables.get(subnet.routeTableId);
    if (table !== undefined) {
      add(
        `${logicalIdOf(subnet.id)}RouteTableAssociation`,
        subnet.id,
        (id) =>
          new CfnSubnetRouteTableAssociation(stack, id, {
            subnetId: resource.ref,
            routeTableId: table.ref,
          }),
      );
    }
    if (subnet.networkAclId !== undefined && !defaultAcls.has(subnet.networkAclId)) {
      const aclRef = acls.get(subnet.networkAclId);
      if (aclRef !== undefined) {
        add(
          `${logicalIdOf(subnet.id)}NetworkAclAssociation`,
          subnet.id,
          (id) =>
            new CfnSubnetNetworkAclAssociation(stack, id, {
              subnetId: resource.ref,
              networkAclId: aclRef,
            }),
        );
      }
    }
  }

  for (const instance of topology.instances) {
    const nic = instance.primaryNetworkInterface;
    const subnet = subnets.get(nic.subnetId);
    const subnetFacts = topology.subnets.find((candidate) => candidate.id === nic.subnetId);
    if (subnet === undefined || subnetFacts === undefined)
      throw new Error(`unknown subnet ${nic.subnetId}`);
    const resource = add(
      logicalIdOf(instance.id),
      instance.id,
      (id) =>
        new CfnInstance(stack, id, {
          imageId: AMI_PARAMETER,
          instanceType: INSTANCE_TYPE,
          // T3 defaults to unlimited credits (AWS::EC2::Instance docs).
          creditSpecification: { cpuCredits: 'standard' },
          networkInterfaces: [
            {
              deviceIndex: '0',
              subnetId: subnet.ref,
              privateIpAddress: nic.privateIpAddress,
              groupSet: nic.securityGroupIds.map(groupRef),
              associatePublicIpAddress: nic.publicIp !== undefined,
              deleteOnTermination: true,
            },
          ],
          tags: tagsOf(instance.id, instance.name),
        }),
    );
    if (nic.publicIp !== undefined) {
      const gatewayId = attachedGatewayOf(subnetFacts.vpcId);
      const attachment = gatewayId === undefined ? undefined : attachments.get(gatewayId);
      if (attachment !== undefined) resource.addResourceDependency(attachment);
    }
  }

  return { stack, logicalIds };
}

export interface SynthesizedStack {
  readonly body: string;
  readonly logicalIds: ReadonlyMap<string, string>;
  /** Logical ID → CloudFormation type. */
  readonly types: ReadonlyMap<string, string>;
}

/** Synthesizes the template body the tool deploys (no assets, so no S3 and no bootstrap). */
export function synthesize(stackName: string, topology: Topology): SynthesizedStack {
  const app = new App({ analyticsReporting: false });
  const { stack, logicalIds } = buildStack(app, stackName, topology);
  const template = app.synth().getStackByName(stack.stackName).template as {
    Resources?: Record<string, { Type: string }>;
  };
  const types = new Map(
    Object.entries(template.Resources ?? {}).map(([id, resource]) => [id, resource.Type]),
  );
  return { body: JSON.stringify(template), logicalIds, types };
}
