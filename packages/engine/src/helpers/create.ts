import {
  contains,
  formatIpv4,
  mustParseCidr,
  mustParseIpv4,
  reservedPurpose,
  type CidrBlock,
} from '../cidr';
import { indexById } from '../internal/lookup';
import type { Topology } from '../schema';
import { createIdAllocator } from './ids';
import { fail, finish, nameTag, unknownReference } from './result';
import type { HelperResult, RunningServiceInput } from './types';

/**
 * Creation helpers: the AWS defaults of each console "Create" action
 * (docs/specs/r0-engine.md section 3.8). Pure: the input topology is never changed.
 *
 * Rules:
 * - RT-01, RT-12 · https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html
 * - NACL-01, NACL-05 · https://docs.aws.amazon.com/vpc/latest/userguide/default-network-acl.html ·
 *   https://docs.aws.amazon.com/vpc/latest/userguide/create-network-acl.html
 * - SG-05 · https://docs.aws.amazon.com/vpc/latest/userguide/default-security-group.html
 * - IGW-05 · https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
 * - ADR-04, ADR-09, ADR-10 · https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html
 */

const ALL_IPV4 = '0.0.0.0/0';

/** Our stand-in for Amazon's public IPv4 pool: RFC 5737 TEST-NET-3 (Inferred, ADR-10). */
export const PUBLIC_POOL = '203.0.113.0/24';

/** Name and description AWS gives the default security group (SG-05; description Inferred). */
export const DEFAULT_SECURITY_GROUP = {
  name: 'default',
  description: 'default VPC security group',
} as const;

export interface CreateVpcInput {
  readonly cidrBlock: string;
  readonly name?: string;
}

export interface CreatedVpc {
  readonly vpcId: string;
  readonly mainRouteTableId: string;
  readonly defaultNetworkAclId: string;
  readonly defaultSecurityGroupId: string;
}

/**
 * Create VPC ("VPC only"): the VPC, its main route table with only the local route (RT-01),
 * its default network ACL with rule 100 allowing all traffic each way (NACL-05) and its
 * `default` security group (SG-05). ID order: vpc, rtb, acl, sg, sgr inbound, sgr outbound.
 */
export function createVpc(topology: Topology, input: CreateVpcInput): HelperResult<CreatedVpc> {
  const take = createIdAllocator(topology);
  const vpcId = take('vpc');
  const mainRouteTableId = take('rtb');
  const defaultNetworkAclId = take('acl');
  const defaultSecurityGroupId = take('sg');
  const allowAll = {
    ruleNumber: 100,
    protocol: 'all',
    cidrBlock: ALL_IPV4,
    action: 'allow',
  } as const;

  return finish(
    {
      ...topology,
      vpcs: [
        ...topology.vpcs,
        {
          id: vpcId,
          ...nameTag(input.name),
          cidrBlock: input.cidrBlock,
          mainRouteTableId,
          defaultNetworkAclId,
          defaultSecurityGroupId,
        },
      ],
      routeTables: [...topology.routeTables, { id: mainRouteTableId, vpcId, routes: [] }],
      networkAcls: [
        ...topology.networkAcls,
        {
          id: defaultNetworkAclId,
          vpcId,
          inboundEntries: [allowAll],
          outboundEntries: [allowAll],
        },
      ],
      securityGroups: [
        ...topology.securityGroups,
        {
          id: defaultSecurityGroupId,
          vpcId,
          ...DEFAULT_SECURITY_GROUP,
          inboundRules: [
            {
              id: take('sgr'),
              protocol: 'all',
              peer: { type: 'security-group', securityGroupId: defaultSecurityGroupId },
            },
          ],
          outboundRules: [
            { id: take('sgr'), protocol: 'all', peer: { type: 'cidr', cidrBlock: ALL_IPV4 } },
          ],
        },
      ],
    },
    { vpcId, mainRouteTableId, defaultNetworkAclId, defaultSecurityGroupId },
  );
}

export interface CreateSubnetInput {
  readonly vpcId: string;
  readonly cidrBlock: string;
  /** Absent means "No preference": the region's first zone (Inferred). */
  readonly availabilityZone?: string;
  readonly name?: string;
}

/**
 * Create subnet: no explicit route table or network ACL association (RT-01, NACL-01) and no
 * public IPv4 addresses on launch (ADR-10).
 */
export function createSubnet(
  topology: Topology,
  input: CreateSubnetInput,
): HelperResult<{ readonly subnetId: string }> {
  if (!topology.vpcs.some((vpc) => vpc.id === input.vpcId)) {
    return unknownReference('vpc', input.vpcId);
  }
  const subnetId = createIdAllocator(topology)('subnet');
  return finish(
    {
      ...topology,
      subnets: [
        ...topology.subnets,
        {
          id: subnetId,
          ...nameTag(input.name),
          vpcId: input.vpcId,
          cidrBlock: input.cidrBlock,
          availabilityZone: input.availabilityZone ?? `${topology.region}a`,
          mapPublicIpOnLaunch: false,
        },
      ],
    },
    { subnetId },
  );
}

/** Create route table: only the local route and no associations (RT-12). */
export function createRouteTable(
  topology: Topology,
  input: { readonly vpcId: string; readonly name?: string },
): HelperResult<{ readonly routeTableId: string }> {
  if (!topology.vpcs.some((vpc) => vpc.id === input.vpcId)) {
    return unknownReference('vpc', input.vpcId);
  }
  const routeTableId = createIdAllocator(topology)('rtb');
  return finish(
    {
      ...topology,
      routeTables: [
        ...topology.routeTables,
        { id: routeTableId, ...nameTag(input.name), vpcId: input.vpcId, routes: [] },
      ],
    },
    { routeTableId },
  );
}

/** Create internet gateway: detached (IGW-05). */
export function createInternetGateway(
  topology: Topology,
  input: { readonly name?: string },
): HelperResult<{ readonly internetGatewayId: string }> {
  const internetGatewayId = createIdAllocator(topology)('igw');
  return finish(
    {
      ...topology,
      internetGateways: [
        ...topology.internetGateways,
        { id: internetGatewayId, ...nameTag(input.name) },
      ],
    },
    { internetGatewayId },
  );
}

/**
 * Create security group: no inbound rules and one outbound rule that allows all traffic
 * (SG-05). Name and description rules (SG-06) are `validate()`'s job.
 */
export function createSecurityGroup(
  topology: Topology,
  input: { readonly vpcId: string; readonly name: string; readonly description: string },
): HelperResult<{ readonly securityGroupId: string }> {
  if (!topology.vpcs.some((vpc) => vpc.id === input.vpcId)) {
    return unknownReference('vpc', input.vpcId);
  }
  const take = createIdAllocator(topology);
  const securityGroupId = take('sg');
  return finish(
    {
      ...topology,
      securityGroups: [
        ...topology.securityGroups,
        {
          id: securityGroupId,
          vpcId: input.vpcId,
          name: input.name,
          description: input.description,
          inboundRules: [],
          outboundRules: [
            { id: take('sgr'), protocol: 'all', peer: { type: 'cidr', cidrBlock: ALL_IPV4 } },
          ],
        },
      ],
    },
    { securityGroupId },
  );
}

/** Create network ACL: only the implicit `*` entries, not associated with any subnet (NACL-05). */
export function createNetworkAcl(
  topology: Topology,
  input: { readonly vpcId: string; readonly name?: string },
): HelperResult<{ readonly networkAclId: string }> {
  if (!topology.vpcs.some((vpc) => vpc.id === input.vpcId)) {
    return unknownReference('vpc', input.vpcId);
  }
  const networkAclId = createIdAllocator(topology)('acl');
  return finish(
    {
      ...topology,
      networkAcls: [
        ...topology.networkAcls,
        {
          id: networkAclId,
          ...nameTag(input.name),
          vpcId: input.vpcId,
          inboundEntries: [],
          outboundEntries: [],
        },
      ],
    },
    { networkAclId },
  );
}

export interface LaunchInstanceInput {
  readonly subnetId: string;
  readonly platform: 'linux' | 'windows';
  readonly name?: string;
  /** Absent: the first free usable address of the subnet (ADR-09, Inferred choice). */
  readonly privateIpAddress?: string;
  /** Absent: the subnet's `mapPublicIpOnLaunch` (ADR-10). */
  readonly autoAssignPublicIp?: boolean;
  /** Absent or empty: the VPC's default security group (SG-05). */
  readonly securityGroupIds?: readonly string[];
  /** The launch view's "Simulated software" (Inferred: AWS has no such field). */
  readonly runningServices?: readonly RunningServiceInput[];
}

export interface LaunchedInstance {
  readonly instanceId: string;
  readonly networkInterfaceId: string;
}

/** First usable address of `block` not in `used` (ADR-04 reserved addresses skipped). */
function firstFreePrivateAddress(block: CidrBlock, used: ReadonlySet<number>): string | null {
  for (let address = block.start; address <= block.end; address += 1) {
    if (reservedPurpose(block, address) === null && !used.has(address)) {
      return formatIpv4(address);
    }
  }
  return null;
}

/** First address of the pool, from .1 to .254, that no interface uses and no VPC CIDR holds. */
function firstFreePublicAddress(topology: Topology): string | null {
  const pool = mustParseCidr(PUBLIC_POOL);
  const vpcBlocks = topology.vpcs.map((vpc) => mustParseCidr(vpc.cidrBlock));
  const used = new Set(
    topology.instances.flatMap((instance) => {
      const publicIp = instance.primaryNetworkInterface.publicIp;
      return publicIp === undefined ? [] : [mustParseIpv4(publicIp.address)];
    }),
  );
  for (let address = pool.start + 1; address < pool.end; address += 1) {
    if (used.has(address)) continue;
    if (vpcBlocks.some((block) => contains(block, address))) continue;
    return formatIpv4(address);
  }
  return null;
}

/**
 * Launch instance: one instance with its primary network interface (ID order: i, eni).
 * Private address, public address and security groups follow r0-engine.md section 3.8.
 */
export function launchInstance(
  topology: Topology,
  input: LaunchInstanceInput,
): HelperResult<LaunchedInstance> {
  const subnets = indexById(topology.subnets);
  const subnet = subnets.get(input.subnetId);
  if (subnet === undefined) return unknownReference('subnet', input.subnetId);
  const vpc = topology.vpcs.find((candidate) => candidate.id === subnet.vpcId);
  if (vpc === undefined) return unknownReference('vpc', subnet.vpcId);
  const groupIds = new Set(topology.securityGroups.map((group) => group.id));
  const unknownGroup = input.securityGroupIds?.find((id) => !groupIds.has(id));
  if (unknownGroup !== undefined) return unknownReference('security-group', unknownGroup);

  let privateIpAddress = input.privateIpAddress;
  if (privateIpAddress === undefined) {
    const block = mustParseCidr(subnet.cidrBlock);
    const usedInVpc = new Set(
      topology.instances.flatMap((instance) => {
        const eni = instance.primaryNetworkInterface;
        return subnets.get(eni.subnetId)?.vpcId === vpc.id
          ? [mustParseIpv4(eni.privateIpAddress)]
          : [];
      }),
    );
    const free = firstFreePrivateAddress(block, usedInVpc);
    if (free === null) {
      return fail('NO_FREE_PRIVATE_ADDRESS', ['ADR-09', 'ADR-04'], {
        subnetId: subnet.id,
        cidrBlock: subnet.cidrBlock,
      });
    }
    privateIpAddress = free;
  }

  let publicIp: { kind: 'auto-assigned'; address: string } | undefined;
  if (input.autoAssignPublicIp ?? subnet.mapPublicIpOnLaunch) {
    const address = firstFreePublicAddress(topology);
    if (address === null) return fail('PUBLIC_POOL_EXHAUSTED', ['ADR-10'], { pool: PUBLIC_POOL });
    publicIp = { kind: 'auto-assigned', address };
  }

  const take = createIdAllocator(topology);
  const instanceId = take('i');
  const networkInterfaceId = take('eni');
  const securityGroupIds =
    input.securityGroupIds !== undefined && input.securityGroupIds.length > 0
      ? [...input.securityGroupIds]
      : [vpc.defaultSecurityGroupId];

  return finish(
    {
      ...topology,
      instances: [
        ...topology.instances,
        {
          id: instanceId,
          ...nameTag(input.name),
          platform: input.platform,
          primaryNetworkInterface: {
            id: networkInterfaceId,
            subnetId: subnet.id,
            privateIpAddress,
            ...(publicIp === undefined ? {} : { publicIp }),
            securityGroupIds,
          },
          runningServices: [...(input.runningServices ?? [])],
        },
      ],
    },
    { instanceId, networkInterfaceId },
  );
}
