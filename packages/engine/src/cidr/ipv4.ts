/** An IPv4 address as an unsigned 32-bit integer (0 to 2^32 - 1). */
export type Ipv4Address = number;

/** One decimal octet without leading zeros, so "010" is never read as octal or as 10. */
const OCTET = /^(0|[1-9]\d{0,2})$/;

/**
 * Parses a dotted-quad IPv4 address: exactly four decimal octets from 0 to 255.
 * Returns null for anything else (no whitespace, no leading zeros, no shorthand).
 */
export function parseIpv4(text: string): Ipv4Address | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!OCTET.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    // Multiplication instead of shifts: shifts would produce signed 32-bit values.
    value = value * 256 + octet;
  }
  return value;
}

/** Like {@link parseIpv4}, but throws. Only for values already checked by the schema. */
export function mustParseIpv4(text: string): Ipv4Address {
  const value = parseIpv4(text);
  if (value === null) throw new Error(`Invariant: invalid IPv4 address "${text}"`);
  return value;
}

/** Formats an unsigned 32-bit integer as a dotted quad. */
export function formatIpv4(address: Ipv4Address): string {
  return [address >>> 24, (address >>> 16) & 255, (address >>> 8) & 255, address & 255].join('.');
}
