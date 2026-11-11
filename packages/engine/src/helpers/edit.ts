import type { Topology, TopologyInput } from '../schema';
import { createIdAllocator } from './ids';
import {
  fail,
  finish,
  replaceById,
  unknownReference,
  without,
  type HelperReferenceType,
} from './result';
import type {
  HelperResult,
  NameTagResource,
  NetworkAclEntryInput,
  RouteInput,
  RuleDirection,
  SecurityGroupRuleDraft,
  SecurityGroupRuleInput,
} from './types';

/**
 * Edit helpers: the console edit actions of docs/specs/r0-engine.md section 3.10.
 * Pure: the input topology is never changed. AWS rules between resources (route
 * destinations, rule numbers, VPC mismatches) are `validate()`'s job, checked by the store
 * with `newErrors`.
 *
 * Rules:
 * - RT-01, RT-03, RT-04, RT-11 · https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html
 * - IGW-05 · https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html
 * - IGW-07, NAT-07 · https://docs.aws.amazon.com/vpc/latest/userguide/delete-igw.html
 * - SG-02, SG-03, SG-04 · https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
 * - NACL-01, NACL-02, NACL-08 · https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
 * - ADR-10 · https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html
 */

const has = (items: readonly { readonly id: string }[], id: string) =>
  items.some((item) => item.id === id);

function edited(candidate: TopologyInput): HelperResult {
  return finish(candidate, {});
}

/** Edit routes: replaces the stored routes; the local route stays derived (RT-03). */
export function replaceRoutes(
  topology: Topology,
  routeTableId: string,
  routes: readonly RouteInput[],
): HelperResult {
  if (!has(topology.routeTables, routeTableId))
    return unknownReference('route-table', routeTableId);
  return edited({
    ...topology,
    routeTables: replaceById(topology.routeTables, routeTableId, (table) => ({
      ...table,
      routes: [...routes],
    })),
  });
}

/** Edit subnet associations: an explicit association replaces the previous one (RT-01). */
export function associateRouteTable(
  topology: Topology,
  subnetId: string,
  routeTableId: string,
): HelperResult {
  if (!has(topology.subnets, subnetId)) return unknownReference('subnet', subnetId);
  if (!has(topology.routeTables, routeTableId))
    return unknownReference('route-table', routeTableId);
  return edited({
    ...topology,
    subnets: replaceById(topology.subnets, subnetId, (subnet) => ({ ...subnet, routeTableId })),
  });
}

/** Removes the explicit association: the subnet uses the main table implicitly (RT-01). */
export function disassociateRouteTable(topology: Topology, subnetId: string): HelperResult {
  if (!has(topology.subnets, subnetId)) return unknownReference('subnet', subnetId);
  return edited({
    ...topology,
    subnets: replaceById(topology.subnets, subnetId, (subnet) => without(subnet, 'routeTableId')),
  });
}

/** Set main route table: the table's VPC uses it as main; explicit associations stay (RT-01). */
export function setMainRouteTable(topology: Topology, routeTableId: string): HelperResult {
  const table = topology.routeTables.find((candidate) => candidate.id === routeTableId);
  if (table === undefined) return unknownReference('route-table', routeTableId);
  return edited({
    ...topology,
    vpcs: replaceById(topology.vpcs, table.vpcId, (vpc) => ({
      ...vpc,
      mainRouteTableId: routeTableId,
    })),
  });
}

/** Attach to VPC: one internet gateway per VPC, and a gateway attaches to one VPC (IGW-05). */
export function attachInternetGateway(
  topology: Topology,
  internetGatewayId: string,
  vpcId: string,
): HelperResult {
  const gateway = topology.internetGateways.find((igw) => igw.id === internetGatewayId);
  if (gateway === undefined) return unknownReference('internet-gateway', internetGatewayId);
  if (!has(topology.vpcs, vpcId)) return unknownReference('vpc', vpcId);
  if (gateway.attachedVpcId !== undefined) {
    return fail('IGW_ALREADY_ATTACHED', ['IGW-05'], {
      internetGatewayId,
      vpcId: gateway.attachedVpcId,
    });
  }
  const other = topology.internetGateways.find((igw) => igw.attachedVpcId === vpcId);
  if (other !== undefined) {
    return fail('VPC_ALREADY_HAS_IGW', ['IGW-05'], { vpcId, internetGatewayId: other.id });
  }
  return edited({
    ...topology,
    internetGateways: replaceById(topology.internetGateways, internetGatewayId, (igw) => ({
      ...igw,
      attachedVpcId: vpcId,
    })),
  });
}

/**
 * Detach from VPC: not while the VPC has public IPv4 addresses (IGW-07). A NAT gateway's
 * Elastic IP counts (NAT-07: "resources with associated ... Elastic IP addresses").
 */
export function detachInternetGateway(topology: Topology, internetGatewayId: string): HelperResult {
  const gateway = topology.internetGateways.find((igw) => igw.id === internetGatewayId);
  if (gateway === undefined) return unknownReference('internet-gateway', internetGatewayId);
  const vpcId = gateway.attachedVpcId;
  if (vpcId === undefined) return fail('IGW_NOT_ATTACHED', ['IGW-07'], { internetGatewayId });

  const subnetsInVpc = new Set(
    topology.subnets.filter((subnet) => subnet.vpcId === vpcId).map((subnet) => subnet.id),
  );
  const instanceCount = topology.instances.filter((instance) => {
    const eni = instance.primaryNetworkInterface;
    return eni.publicIp !== undefined && subnetsInVpc.has(eni.subnetId);
  }).length;
  const natCount = (topology.natGateways ?? []).filter((nat) =>
    subnetsInVpc.has(nat.subnetId),
  ).length;
  const count = instanceCount + natCount;
  if (count > 0) {
    const ruleIds = natCount > 0 ? (['IGW-07', 'NAT-07'] as const) : (['IGW-07'] as const);
    return fail('IGW_HAS_PUBLIC_ADDRESSES', ruleIds, { internetGatewayId, vpcId, count });
  }
  return edited({
    ...topology,
    internetGateways: replaceById(topology.internetGateways, internetGatewayId, (igw) =>
      without(igw, 'attachedVpcId'),
    ),
  });
}

const RULES_KEY = { inbound: 'inboundRules', outbound: 'outboundRules' } as const;
const ENTRIES_KEY = { inbound: 'inboundEntries', outbound: 'outboundEntries' } as const;

/**
 * Edit inbound or outbound rules (SG-02 to SG-04). A rule keeps its `id` when the group
 * already has it in that direction and no earlier rule in the list took it; every other
 * rule gets a new `sgr` ID, in list order.
 */
export function replaceSecurityGroupRules(
  topology: Topology,
  securityGroupId: string,
  direction: RuleDirection,
  rules: readonly SecurityGroupRuleDraft[],
): HelperResult {
  const group = topology.securityGroups.find((candidate) => candidate.id === securityGroupId);
  if (group === undefined) return unknownReference('security-group', securityGroupId);
  const key = RULES_KEY[direction];
  const known = new Set(group[key].map((rule) => rule.id));
  const take = createIdAllocator(topology);
  const kept = new Set<string>();
  const withIds = rules.map((rule): SecurityGroupRuleInput => {
    const id = rule.id !== undefined && known.has(rule.id) && !kept.has(rule.id) ? rule.id : null;
    if (id !== null) kept.add(id);
    return { ...rule, id: id ?? take('sgr') };
  });
  return edited({
    ...topology,
    securityGroups: replaceById(topology.securityGroups, securityGroupId, (current) => ({
      ...current,
      [key]: withIds,
    })),
  });
}

/** Edit inbound or outbound rules of a network ACL; the `*` entry stays implicit (NACL-02). */
export function replaceNetworkAclEntries(
  topology: Topology,
  networkAclId: string,
  direction: RuleDirection,
  entries: readonly NetworkAclEntryInput[],
): HelperResult {
  if (!has(topology.networkAcls, networkAclId))
    return unknownReference('network-acl', networkAclId);
  return edited({
    ...topology,
    networkAcls: replaceById(topology.networkAcls, networkAclId, (acl) => ({
      ...acl,
      [ENTRIES_KEY[direction]]: [...entries],
    })),
  });
}

/**
 * Edit subnet associations of a network ACL (NACL-01). Choosing the VPC's default network
 * ACL clears the explicit association, because R0 models the default one as absent.
 */
export function associateNetworkAcl(
  topology: Topology,
  subnetId: string,
  networkAclId: string,
): HelperResult {
  const subnet = topology.subnets.find((candidate) => candidate.id === subnetId);
  if (subnet === undefined) return unknownReference('subnet', subnetId);
  if (!has(topology.networkAcls, networkAclId))
    return unknownReference('network-acl', networkAclId);
  const vpc = topology.vpcs.find((candidate) => candidate.id === subnet.vpcId);
  const isDefault = vpc?.defaultNetworkAclId === networkAclId;
  return edited({
    ...topology,
    subnets: replaceById(topology.subnets, subnetId, (current) =>
      isDefault ? without(current, 'networkAclId') : { ...current, networkAclId },
    ),
  });
}

/** Edit subnet settings › Auto-assign public IPv4 address (ADR-10). Instances don't change. */
export function setMapPublicIpOnLaunch(
  topology: Topology,
  subnetId: string,
  mapPublicIpOnLaunch: boolean,
): HelperResult {
  if (!has(topology.subnets, subnetId)) return unknownReference('subnet', subnetId);
  return edited({
    ...topology,
    subnets: replaceById(topology.subnets, subnetId, (subnet) => ({
      ...subnet,
      mapPublicIpOnLaunch,
    })),
  });
}

const NAME_TAG_COLLECTION = {
  vpc: 'vpcs',
  subnet: 'subnets',
  'route-table': 'routeTables',
  'internet-gateway': 'internetGateways',
  'nat-gateway': 'natGateways',
  'network-acl': 'networkAcls',
  instance: 'instances',
} as const satisfies Record<NameTagResource['type'], keyof Topology>;

/** Sets the Name tag, or removes it when `name` is empty. */
export function setNameTag(
  topology: Topology,
  resource: NameTagResource,
  name: string,
): HelperResult {
  const collection = NAME_TAG_COLLECTION[resource.type];
  // `natGateways` is optional (r1-nat-gateway.md 2): absent means none.
  const items: readonly { readonly id: string; readonly name?: string }[] =
    topology[collection] ?? [];
  if (!has(items, resource.id)) {
    return unknownReference(resource.type satisfies HelperReferenceType, resource.id);
  }
  return edited({
    ...topology,
    [collection]: replaceById(items, resource.id, (item) =>
      name === '' ? without(item, 'name') : { ...item, name },
    ),
  });
}
