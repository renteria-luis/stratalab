import { isWithin, mustParseCidr, type CidrBlock } from './block';

/**
 * Private address ranges from RFC 1918 (10/8, 172.16/12, 192.168/16).
 * Rules: ADR-01, ADR-10, IGW-03 · https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html
 */
export const RFC1918_BLOCKS: readonly CidrBlock[] = [
  mustParseCidr('10.0.0.0/8'),
  mustParseCidr('172.16.0.0/12'),
  mustParseCidr('192.168.0.0/16'),
];

/**
 * Shared address space from RFC 6598, rejected by the internet gateway.
 * Rules: ADR-10, IGW-03 · https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export const RFC6598_BLOCK: CidrBlock = mustParseCidr('100.64.0.0/10');

/**
 * Blocks AWS doesn't accept as a VPC CIDR: 0.0.0.0/8, loopback, link-local and multicast.
 * Rule: ADR-01 · https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html
 */
export const VPC_RESTRICTED_BLOCKS: readonly CidrBlock[] = [
  mustParseCidr('0.0.0.0/8'),
  mustParseCidr('127.0.0.0/8'),
  mustParseCidr('169.254.0.0/16'),
  mustParseCidr('224.0.0.0/4'),
];

/** The first block in `blocks` that contains `block` (equal or larger), or null. */
export function findBlockContaining(
  blocks: readonly CidrBlock[],
  block: CidrBlock,
): CidrBlock | null {
  return blocks.find((candidate) => isWithin(block, candidate)) ?? null;
}
