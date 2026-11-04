import { blockSize, contains, type CidrBlock } from './block';
import type { Ipv4Address } from './ipv4';

/** Why AWS reserves an address in a subnet (ADR-04, ADR-06). */
export type ReservedPurpose = 'network' | 'vpc-router' | 'dns' | 'future-use' | 'broadcast';

export interface ReservedAddress {
  readonly address: Ipv4Address;
  readonly purpose: ReservedPurpose;
}

/**
 * The addresses AWS reserves in a subnet: the first four and the last one.
 * Example 10.0.0.0/24: .0 network, .1 VPC router, .2 DNS, .3 future use, .255 broadcast.
 * For blocks smaller than 8 addresses an address keeps its first purpose in that list.
 *
 * Rules: ADR-04, ADR-06 · https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
 */
export function reservedAddresses(block: CidrBlock): readonly ReservedAddress[] {
  const candidates: readonly ReservedAddress[] = [
    { address: block.start, purpose: 'network' },
    { address: block.start + 1, purpose: 'vpc-router' },
    { address: block.start + 2, purpose: 'dns' },
    { address: block.start + 3, purpose: 'future-use' },
    { address: block.end, purpose: 'broadcast' },
  ];
  const result: ReservedAddress[] = [];
  for (const candidate of candidates) {
    const seen = result.some((entry) => entry.address === candidate.address);
    if (contains(block, candidate.address) && !seen) result.push(candidate);
  }
  return result;
}

/** The reserved purpose of `address` in `block`, or null when the address is usable (ADR-04). */
export function reservedPurpose(block: CidrBlock, address: Ipv4Address): ReservedPurpose | null {
  return reservedAddresses(block).find((entry) => entry.address === address)?.purpose ?? null;
}

/**
 * Usable addresses in a subnet: 2^(32 - n) - 5 (ADR-04). BYOIP ranges, where every address
 * is usable, are Unsupported.
 */
export function usableAddressCount(prefix: number): number {
  return Math.max(0, blockSize(prefix) - 5);
}
