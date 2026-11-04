import { describe, expect, it } from 'vitest';
import {
  canonicalizeCidr,
  contains,
  findBlockContaining,
  formatCidr,
  formatIpv4,
  isWithin,
  mustParseCidr,
  overlaps,
  parseCidr,
  parseIpv4,
  reservedAddresses,
  RFC1918_BLOCKS,
  RFC6598_BLOCK,
  usableAddressCount,
  VPC_RESTRICTED_BLOCKS,
} from '../src/cidr';

const ip = (text: string): number => {
  const value = parseIpv4(text);
  if (value === null) throw new Error(`test setup: invalid IPv4 ${text}`);
  return value;
};

describe('IPv4 parsing', () => {
  it('ADR-05: parses dotted quads into unsigned 32-bit integers', () => {
    expect(parseIpv4('0.0.0.0')).toBe(0);
    expect(parseIpv4('10.0.1.10')).toBe(167_772_426);
    expect(parseIpv4('255.255.255.255')).toBe(4_294_967_295);
  });

  it('ADR-05: rejects anything that is not four octets from 0 to 255', () => {
    for (const text of [
      '',
      '1.2.3',
      '1.2.3.4.5',
      '256.0.0.1',
      '1.2.3.-1',
      ' 1.2.3.4',
      '1.2.3.4 ',
      '01.2.3.4',
      '1.2.3.a',
      '1..3.4',
    ]) {
      expect(parseIpv4(text), text).toBeNull();
    }
  });

  it('ADR-05: formats integers back to dotted quads', () => {
    expect(formatIpv4(0)).toBe('0.0.0.0');
    expect(formatIpv4(167_772_426)).toBe('10.0.1.10');
    expect(formatIpv4(4_294_967_295)).toBe('255.255.255.255');
  });
});

describe('CIDR parsing and canonical form', () => {
  it('ADR-05: keeps the given address and the prefix', () => {
    expect(parseCidr('100.68.0.18/18')).toEqual({ address: ip('100.68.0.18'), prefix: 18 });
  });

  it('ADR-05: rejects malformed CIDRs', () => {
    for (const text of [
      '10.0.0.0',
      '10.0.0.0/',
      '10.0.0.0/33',
      '10.0.0.0/08',
      '10.0.0/16',
      '/16',
    ]) {
      expect(parseCidr(text), text).toBeNull();
    }
  });

  it('ADR-05: rewrites a CIDR to its canonical form like the AWS API', () => {
    expect(canonicalizeCidr('100.68.0.18/18')).toBe('100.68.0.0/18');
    expect(canonicalizeCidr('10.0.1.7/24')).toBe('10.0.1.0/24');
    expect(canonicalizeCidr('10.0.0.0/0')).toBe('0.0.0.0/0');
    expect(canonicalizeCidr('10.0.0.1/32')).toBe('10.0.0.1/32');
    expect(canonicalizeCidr('nope')).toBeNull();
  });

  it('ADR-05: a parsed block has its start, end and prefix', () => {
    const block = mustParseCidr('10.0.1.7/24');
    expect(block).toMatchObject({ start: ip('10.0.1.0'), end: ip('10.0.1.255'), prefix: 24 });
    expect(formatCidr(block)).toBe('10.0.1.0/24');
  });
});

describe('containment and overlap', () => {
  it('ADR-02: a block contains exactly the addresses from its start to its end', () => {
    const vpc = mustParseCidr('10.0.0.0/16');
    expect(contains(vpc, ip('10.0.0.0'))).toBe(true);
    expect(contains(vpc, ip('10.0.255.255'))).toBe(true);
    expect(contains(vpc, ip('10.1.0.0'))).toBe(false);
    expect(contains(vpc, ip('9.255.255.255'))).toBe(false);
  });

  it('ADR-02: a subnet is within its VPC when it equals it or is a subset', () => {
    const vpc = mustParseCidr('10.0.0.0/16');
    expect(isWithin(mustParseCidr('10.0.1.0/24'), vpc)).toBe(true);
    expect(isWithin(mustParseCidr('10.0.0.0/16'), vpc)).toBe(true);
    expect(isWithin(vpc, mustParseCidr('10.0.1.0/24'))).toBe(false);
    expect(isWithin(mustParseCidr('10.1.0.0/24'), vpc)).toBe(false);
  });

  it('ADR-03: nested blocks overlap, adjacent blocks do not', () => {
    expect(overlaps(mustParseCidr('10.0.0.0/16'), mustParseCidr('10.0.128.0/17'))).toBe(true);
    expect(overlaps(mustParseCidr('10.0.0.0/24'), mustParseCidr('10.0.1.0/24'))).toBe(false);
    expect(overlaps(mustParseCidr('10.0.0.0/23'), mustParseCidr('10.0.1.0/24'))).toBe(true);
  });
});

describe('reserved addresses', () => {
  it('ADR-04: reserves .0, .1, .2, .3 and .255 in 10.0.0.0/24, with their purposes', () => {
    expect(reservedAddresses(mustParseCidr('10.0.0.0/24'))).toEqual([
      { address: ip('10.0.0.0'), purpose: 'network' },
      { address: ip('10.0.0.1'), purpose: 'vpc-router' },
      { address: ip('10.0.0.2'), purpose: 'dns' },
      { address: ip('10.0.0.3'), purpose: 'future-use' },
      { address: ip('10.0.0.255'), purpose: 'broadcast' },
    ]);
  });

  it('ADR-04: usable addresses are 2^(32 - n) - 5', () => {
    expect(usableAddressCount(16)).toBe(65_531);
    expect(usableAddressCount(24)).toBe(251);
    expect(usableAddressCount(28)).toBe(11);
  });
});

describe('special ranges', () => {
  it('ADR-01: finds the restricted block that contains a VPC CIDR', () => {
    expect(VPC_RESTRICTED_BLOCKS.map(formatCidr)).toEqual([
      '0.0.0.0/8',
      '127.0.0.0/8',
      '169.254.0.0/16',
      '224.0.0.0/4',
    ]);
    const restricted = findBlockContaining(VPC_RESTRICTED_BLOCKS, mustParseCidr('127.0.0.0/16'));
    expect(restricted && formatCidr(restricted)).toBe('127.0.0.0/8');
    expect(findBlockContaining(VPC_RESTRICTED_BLOCKS, mustParseCidr('10.0.0.0/16'))).toBeNull();
  });

  it('IGW-03: RFC 1918 covers 10/8, 172.16/12 and 192.168/16 and nothing next to them', () => {
    const inRfc1918 = (text: string) =>
      findBlockContaining(RFC1918_BLOCKS, mustParseCidr(`${text}/32`)) !== null;
    expect(inRfc1918('10.255.255.255')).toBe(true);
    expect(inRfc1918('172.15.255.255')).toBe(false);
    expect(inRfc1918('172.16.0.0')).toBe(true);
    expect(inRfc1918('172.31.255.255')).toBe(true);
    expect(inRfc1918('172.32.0.0')).toBe(false);
    expect(inRfc1918('192.168.0.1')).toBe(true);
    expect(inRfc1918('192.169.0.1')).toBe(false);
  });

  it('IGW-03: RFC 6598 is 100.64.0.0/10', () => {
    expect(formatCidr(RFC6598_BLOCK)).toBe('100.64.0.0/10');
    expect(contains(RFC6598_BLOCK, ip('100.127.255.255'))).toBe(true);
    expect(contains(RFC6598_BLOCK, ip('100.128.0.0'))).toBe(false);
  });
});
