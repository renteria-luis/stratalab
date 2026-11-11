import {
  classifyNonPublic,
  contains,
  findBlockContaining,
  formatCidr,
  isWithin,
  mustParseCidr,
  mustParseIpv4,
  overlaps,
  reservedPurpose,
  toBlock,
  VPC_RESTRICTED_BLOCKS,
  type CidrBlock,
} from '../cidr';
import { indexById, mustGet } from '../internal/lookup';
import type { Topology } from '../schema';
import type { RuleId } from '../rules';
import type { Issue, ResourceRef } from './issue';

/** VPC and subnet IPv4 CIDRs are /16 to /28 (ADR-01, ADR-02). */
const MIN_PREFIX = 16;
const MAX_PREFIX = 28;

const sizeParams = (cidrBlock: string, prefixLength: number) => ({
  cidrBlock,
  prefixLength,
  minPrefixLength: MIN_PREFIX,
  maxPrefixLength: MAX_PREFIX,
});

const isValidSize = (block: CidrBlock) => block.prefix >= MIN_PREFIX && block.prefix <= MAX_PREFIX;

/**
 * Addressing checks of `validate()`.
 *
 * Rules:
 * - ADR-01 VPC CIDR size and restricted ranges: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html
 * - ADR-02 subnet size and placement, ADR-03 no overlap, ADR-04 reserved addresses:
 *   https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
 * - ADR-09 primary private IPv4 address: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html
 * - ADR-10 public IPv4 address: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html
 *   and https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html (RFC 1918 and RFC 6598)
 * - NAT-07 a NAT gateway's private IP comes from its subnet; its Elastic IP can't be in use:
 *   https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html and
 *   https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-troubleshooting.html
 */
export function checkAddressing(topology: Topology): Issue[] {
  return [...checkVpcs(topology), ...checkSubnets(topology), ...checkInterfaces(topology)];
}

/** ADR-01: size, then restricted blocks. Publicly routable CIDRs are allowed. */
function checkVpcs(topology: Topology): Issue[] {
  const issues: Issue[] = [];
  topology.vpcs.forEach((vpc, i) => {
    const block = mustParseCidr(vpc.cidrBlock);
    const resource = { type: 'vpc', id: vpc.id } as const;
    const path = ['vpcs', i, 'cidrBlock'] as const;
    if (!isValidSize(block)) {
      issues.push({
        code: 'VPC_SIZE_INVALID',
        severity: 'error',
        ruleIds: ['ADR-01'],
        fidelity: 'Exact',
        resource,
        path,
        params: sizeParams(vpc.cidrBlock, block.prefix),
      });
    }
    const restricted = findBlockContaining(VPC_RESTRICTED_BLOCKS, block);
    if (restricted !== null) {
      issues.push({
        code: 'VPC_CIDR_RESTRICTED',
        severity: 'error',
        ruleIds: ['ADR-01'],
        // The docs list the blocks; rejecting smaller CIDRs inside them is our reading (Q9).
        fidelity: restricted.prefix === block.prefix ? 'Exact' : 'Inferred',
        resource,
        path,
        params: { cidrBlock: vpc.cidrBlock, restrictedBlock: formatCidr(restricted) },
      });
    }
  });
  return issues;
}

/** ADR-02 size and placement, ADR-03 overlap with an earlier subnet of the same VPC. */
function checkSubnets(topology: Topology): Issue[] {
  const issues: Issue[] = [];
  const vpcs = indexById(topology.vpcs);
  const blocks = topology.subnets.map((subnet) => mustParseCidr(subnet.cidrBlock));

  topology.subnets.forEach((subnet, i) => {
    const block = mustParseCidr(subnet.cidrBlock);
    const vpc = mustGet(vpcs, subnet.vpcId);
    const resource = { type: 'subnet', id: subnet.id } as const;
    const path = ['subnets', i, 'cidrBlock'] as const;

    if (!isValidSize(block)) {
      issues.push({
        code: 'SUBNET_SIZE_INVALID',
        severity: 'error',
        ruleIds: ['ADR-02'],
        fidelity: 'Exact',
        resource,
        path,
        params: sizeParams(subnet.cidrBlock, block.prefix),
      });
    }

    if (!isWithin(block, mustParseCidr(vpc.cidrBlock))) {
      issues.push({
        code: 'SUBNET_CIDR_OUT_OF_VPC',
        severity: 'error',
        ruleIds: ['ADR-02'],
        fidelity: 'Exact',
        resource,
        path,
        params: { cidrBlock: subnet.cidrBlock, vpcCidrBlock: vpc.cidrBlock },
      });
    }

    // One issue per pair, on the later subnet, so the same overlap isn't reported twice.
    topology.subnets.slice(0, i).forEach((earlier, j) => {
      const earlierBlock = blocks[j];
      if (earlier.vpcId !== subnet.vpcId || earlierBlock === undefined) return;
      if (!overlaps(block, earlierBlock)) return;
      issues.push({
        code: 'CIDR_OVERLAP',
        severity: 'error',
        ruleIds: ['ADR-03'],
        fidelity: 'Exact',
        resource,
        path,
        related: [{ type: 'subnet', id: earlier.id }],
        params: { cidrBlock: subnet.cidrBlock, otherCidrBlock: earlier.cidrBlock },
      });
    });
  });
  return issues;
}

/** One private address and an optional public address to check (ADR-04, ADR-09, ADR-10). */
interface AddressOwner {
  readonly resource: ResourceRef;
  readonly subnetId: string;
  readonly privateIp: string;
  readonly privatePath: Issue['path'];
  readonly publicIp: string | null;
  readonly publicPath: Issue['path'];
  /** NAT gateways add NAT-07 to every address rule (r1-nat-gateway.md section 3). */
  readonly extraRuleIds: readonly RuleId[];
  /** An Elastic IP already associated elsewhere is a documented failure (NAT-07). */
  readonly publicDuplicateFidelity: 'Exact' | 'Inferred';
}

/**
 * ADR-04, ADR-09, ADR-10 for each NAT gateway (NAT-07), then each instance's primary network
 * interface. NAT gateways come first, as in topology key order, so a later instance that
 * reuses one of their addresses gets the `IP_DUPLICATE` issue.
 */
function checkInterfaces(topology: Topology): Issue[] {
  const owners: AddressOwner[] = [
    ...(topology.natGateways ?? []).map((nat, i): AddressOwner => ({
      resource: { type: 'nat-gateway', id: nat.id },
      subnetId: nat.subnetId,
      privateIp: nat.privateIpAddress,
      privatePath: ['natGateways', i, 'privateIpAddress'],
      publicIp: nat.elasticIpAddress,
      publicPath: ['natGateways', i, 'elasticIpAddress'],
      extraRuleIds: ['NAT-07'],
      publicDuplicateFidelity: 'Exact',
    })),
    ...topology.instances.map((instance, i): AddressOwner => {
      const eni = instance.primaryNetworkInterface;
      return {
        resource: { type: 'network-interface', id: eni.id },
        subnetId: eni.subnetId,
        privateIp: eni.privateIpAddress,
        privatePath: ['instances', i, 'primaryNetworkInterface', 'privateIpAddress'],
        publicIp: eni.publicIp?.address ?? null,
        publicPath: ['instances', i, 'primaryNetworkInterface', 'publicIp', 'address'],
        extraRuleIds: [],
        publicDuplicateFidelity: 'Inferred',
      };
    }),
  ];
  const issues: Issue[] = [];
  const subnets = indexById(topology.subnets);
  const vpcBlocks = topology.vpcs.map((vpc) => mustParseCidr(vpc.cidrBlock));
  /** First owner seen per "vpcId address" (private) and per address (public). */
  const privateOwners = new Map<string, ResourceRef>();
  const publicOwners = new Map<string, ResourceRef>();

  for (const owner of owners) {
    const { resource, privateIp, privatePath, publicPath, extraRuleIds } = owner;
    const subnet = mustGet(subnets, owner.subnetId);
    const subnetBlock = mustParseCidr(subnet.cidrBlock);
    const privateAddress = mustParseIpv4(privateIp);
    const rules = (ruleId: RuleId): RuleId[] => [ruleId, ...extraRuleIds];

    if (!contains(subnetBlock, privateAddress)) {
      issues.push({
        code: 'IP_OUT_OF_SUBNET',
        severity: 'error',
        ruleIds: rules('ADR-09'),
        fidelity: 'Exact',
        resource,
        path: privatePath,
        params: { ipAddress: privateIp, subnetCidrBlock: subnet.cidrBlock },
      });
    } else {
      const purpose = reservedPurpose(subnetBlock, privateAddress);
      if (purpose !== null) {
        issues.push({
          code: 'IP_RESERVED',
          severity: 'error',
          ruleIds: rules('ADR-04'),
          fidelity: 'Exact',
          resource,
          path: privatePath,
          params: { ipAddress: privateIp, subnetCidrBlock: subnet.cidrBlock, purpose },
        });
      }
    }

    // Private addresses repeat legitimately across VPCs, so uniqueness is per VPC (Inferred).
    const privateKey = `${subnet.vpcId} ${privateIp}`;
    const privateOwner = privateOwners.get(privateKey);
    if (privateOwner === undefined) {
      privateOwners.set(privateKey, resource);
    } else {
      issues.push({
        code: 'IP_DUPLICATE',
        severity: 'error',
        ruleIds: rules('ADR-09'),
        fidelity: 'Inferred',
        resource,
        path: privatePath,
        related: [privateOwner],
        params: { ipAddress: privateIp, kind: 'private' },
      });
    }

    const publicAddress = owner.publicIp;
    if (publicAddress === null) continue;

    const publicOwner = publicOwners.get(publicAddress);
    if (publicOwner === undefined) {
      publicOwners.set(publicAddress, resource);
    } else {
      issues.push({
        code: 'IP_DUPLICATE',
        severity: 'error',
        ruleIds: rules('ADR-10'),
        fidelity: owner.publicDuplicateFidelity,
        resource,
        path: publicPath,
        related: [publicOwner],
        params: { ipAddress: publicAddress, kind: 'public' },
      });
    }

    const invalid = classifyNonPublic(toBlock(mustParseIpv4(publicAddress), 32), vpcBlocks);
    if (invalid !== null) {
      issues.push({
        code: 'PUBLIC_IP_INVALID',
        severity: 'error',
        ruleIds: rules('ADR-10'),
        fidelity: 'Exact',
        resource,
        path: publicPath,
        params: {
          ipAddress: publicAddress,
          reason: invalid.reason,
          range: formatCidr(invalid.range),
        },
      });
    }
  }
  return issues;
}
