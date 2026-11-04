import { formatIpv4, parseIpv4, type Ipv4Address } from './ipv4';

/**
 * A canonical IPv4 CIDR block: `start` is the network address, `end` the last address.
 * Math follows the "CIDR math" section of the aws-network-rules skill (addressing.md):
 * unsigned 32-bit integers, and every bitwise expression ends with `>>> 0`.
 */
export interface CidrBlock {
  readonly start: Ipv4Address;
  readonly end: Ipv4Address;
  readonly prefix: number;
}

/** A CIDR as written: the address may have host bits set (non-canonical). */
export interface ParsedCidr {
  readonly address: Ipv4Address;
  readonly prefix: number;
}

/** Prefix length from 0 to 32, without leading zeros. */
const PREFIX = /^(0|[1-9]\d?)$/;

/** Netmask for a prefix. `/0` is special: JavaScript only uses the low 5 bits of a shift count. */
export function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
}

/** Number of addresses in a block with this prefix: 2^(32 - n). */
export function blockSize(prefix: number): number {
  return 2 ** (32 - prefix);
}

/** The canonical block that contains `address` with this prefix (ADR-05). */
export function toBlock(address: Ipv4Address, prefix: number): CidrBlock {
  const mask = maskOf(prefix);
  const start = (address & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return { start, end, prefix };
}

/** Parses "a.b.c.d/n" without changing it. Returns null when the address or prefix is invalid. */
export function parseCidr(text: string): ParsedCidr | null {
  const parts = text.split('/');
  if (parts.length !== 2) return null;
  const [addressText = '', prefixText = ''] = parts;
  const address = parseIpv4(addressText);
  if (address === null || !PREFIX.test(prefixText)) return null;
  const prefix = Number(prefixText);
  if (prefix > 32) return null;
  return { address, prefix };
}

/** Parses a CIDR into its canonical block, or null when it is invalid. */
export function cidrBlockOf(text: string): CidrBlock | null {
  const parsed = parseCidr(text);
  return parsed === null ? null : toBlock(parsed.address, parsed.prefix);
}

/** Like {@link cidrBlockOf}, but throws. Only for constants and values already checked by the schema. */
export function mustParseCidr(text: string): CidrBlock {
  const block = cidrBlockOf(text);
  if (block === null) throw new Error(`Invariant: invalid IPv4 CIDR "${text}"`);
  return block;
}

export function formatCidr(block: CidrBlock): string {
  return `${formatIpv4(block.start)}/${String(block.prefix)}`;
}

/**
 * Rewrites a CIDR to its canonical form, as the AWS API does (ADR-05):
 * 100.68.0.18/18 becomes 100.68.0.0/18. Returns null when the CIDR is invalid.
 */
export function canonicalizeCidr(text: string): string | null {
  const block = cidrBlockOf(text);
  return block === null ? null : formatCidr(block);
}

export function contains(block: CidrBlock, address: Ipv4Address): boolean {
  return (address & maskOf(block.prefix)) >>> 0 === block.start;
}

export function overlaps(a: CidrBlock, b: CidrBlock): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** True when `inner` equals `outer` or is a subset of it (ADR-02). */
export function isWithin(inner: CidrBlock, outer: CidrBlock): boolean {
  return inner.prefix >= outer.prefix && contains(outer, inner.start);
}
