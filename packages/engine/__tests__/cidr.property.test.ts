import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  blockSize,
  canonicalizeCidr,
  contains,
  formatCidr,
  formatIpv4,
  isWithin,
  overlaps,
  parseIpv4,
  reservedAddresses,
  toBlock,
  usableAddressCount,
} from '../src/cidr';

const anyAddress = fc.integer({ min: 0, max: 0xffff_ffff });
const anyPrefix = fc.integer({ min: 0, max: 32 });
const anyBlock = fc
  .tuple(anyAddress, anyPrefix)
  .map(([address, prefix]) => toBlock(address, prefix));
/** Prefixes where the five reserved addresses (ADR-04) are distinct. */
const subnetPrefix = fc.integer({ min: 0, max: 29 });

describe('CIDR math properties', () => {
  it('ADR-05: formatting and parsing an address round-trips', () => {
    fc.assert(fc.property(anyAddress, (address) => parseIpv4(formatIpv4(address)) === address));
  });

  it('ADR-05: the canonical block starts at or before the address and ends at or after it', () => {
    fc.assert(
      fc.property(anyAddress, anyPrefix, (address, prefix) => {
        const block = toBlock(address, prefix);
        return block.start <= address && address <= block.end;
      }),
    );
  });

  it('ADR-05: canonical form is idempotent and keeps the original address inside', () => {
    fc.assert(
      fc.property(anyAddress, anyPrefix, (address, prefix) => {
        const canonical = canonicalizeCidr(`${formatIpv4(address)}/${String(prefix)}`);
        expect(canonical).not.toBeNull();
        expect(canonicalizeCidr(canonical ?? '')).toBe(canonical);
        expect(contains(toBlock(address, prefix), address)).toBe(true);
        expect(formatCidr(toBlock(address, prefix))).toBe(canonical);
      }),
    );
  });

  it('ADR-05: a block has 2^(32 - n) addresses', () => {
    fc.assert(
      fc.property(anyBlock, (block) => block.end - block.start + 1 === blockSize(block.prefix)),
    );
  });

  it('ADR-02: contains agrees with start <= x <= end', () => {
    fc.assert(
      fc.property(
        anyBlock,
        anyAddress,
        (block, x) => contains(block, x) === (block.start <= x && x <= block.end),
      ),
    );
  });

  it('ADR-02: a /32 contains only itself and a /0 contains every address', () => {
    fc.assert(
      fc.property(anyAddress, anyAddress, (a, b) => {
        expect(contains(toBlock(a, 32), b)).toBe(a === b);
        expect(contains(toBlock(a, 0), b)).toBe(true);
      }),
    );
  });

  it('ADR-02: isWithin is reflexive, antisymmetric and implies overlap', () => {
    fc.assert(
      fc.property(anyBlock, anyBlock, (a, b) => {
        expect(isWithin(a, a)).toBe(true);
        if (isWithin(a, b) && isWithin(b, a)) expect(a).toEqual(b);
        if (isWithin(a, b)) expect(overlaps(a, b)).toBe(true);
      }),
    );
  });

  it('ADR-03: overlap is symmetric', () => {
    fc.assert(fc.property(anyBlock, anyBlock, (a, b) => overlaps(a, b) === overlaps(b, a)));
  });

  it('ADR-03: two CIDR blocks overlap only when one is within the other', () => {
    fc.assert(
      fc.property(
        anyBlock,
        anyBlock,
        (a, b) => overlaps(a, b) === (isWithin(a, b) || isWithin(b, a)),
      ),
    );
  });

  it('ADR-04: a subnet reserves its first four addresses and its last one', () => {
    fc.assert(
      fc.property(anyAddress, subnetPrefix, (address, prefix) => {
        const block = toBlock(address, prefix);
        const reserved = reservedAddresses(block).map((entry) => entry.address);
        expect(reserved).toEqual([
          block.start,
          block.start + 1,
          block.start + 2,
          block.start + 3,
          block.end,
        ]);
        expect(usableAddressCount(prefix)).toBe(blockSize(prefix) - 5);
      }),
    );
  });
});
