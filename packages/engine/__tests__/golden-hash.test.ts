import { describe, expect, it } from 'vitest';
import {
  GOLDEN_MAPPING_VERSION,
  GOLDEN_SCENARIO_INPUTS,
  canonicalJson,
  goldenScenarioSchema,
  scenarioHash,
  sha256Hex,
  utf8Encode,
  type GoldenScenarioInput,
} from '../golden/index';

const hex = (text: string) => sha256Hex(utf8Encode(text));

function s1Input(): GoldenScenarioInput {
  const input = GOLDEN_SCENARIO_INPUTS.find((scenario) => scenario.id === 's1-f1-internet-to-web');
  if (input === undefined) throw new Error('s1 is missing');
  return JSON.parse(JSON.stringify(input)) as GoldenScenarioInput;
}

const hashOf = (input: GoldenScenarioInput, mappingVersion?: number) =>
  scenarioHash(goldenScenarioSchema.parse(input), mappingVersion);

describe('golden scenario hash (docs/specs/p9-golden.md section 4)', () => {
  it('TRC-06: sha256 matches the FIPS 180-4 example vectors', () => {
    expect(hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(hex('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });

  it('TRC-06: sha256 hashes multi-byte UTF-8 text', () => {
    expect([...utf8Encode('é🚀')]).toEqual([0xc3, 0xa9, 0xf0, 0x9f, 0x9a, 0x80]);
    expect(hex('Señal → 🚀')).toBe(
      'c7c64d57c29918ea08508af5faf1191fa7822479f9cac9474fec4b579c3ff4b7',
    );
  });

  it('TRC-06: canonical JSON sorts keys, keeps array order and rejects non-finite numbers', () => {
    expect(canonicalJson({ b: 1, a: [3, { d: 'x"y', c: true }], e: undefined, f: null })).toBe(
      '{"a":[3,{"c":true,"d":"x\\"y"}],"b":1,"f":null}',
    );
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('TRC-06: the scenario hash has the sha256: prefix and 64 hex characters', () => {
    expect(hashOf(s1Input())).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashOf(s1Input())).toBe(hashOf(s1Input()));
  });

  it('TRC-06: the scenario hash ignores titles, labels, rule IDs, legs and expected results', () => {
    const changed = s1Input();
    changed.title = 'Another title';
    const query = changed.queries[0];
    if (query === undefined) throw new Error('s1 has queries');
    changed.queries[0] = {
      ...query,
      label: 'Another label',
      ruleIds: ['SG-02'],
      leg: 'reply',
      expected: {
        verdict: 'BROKE_AT_HOP',
        direction: 'forward',
        hopIndex: 0,
        reasonCodes: ['NO_ROUTE_TO_DESTINATION'],
      },
    };
    expect(hashOf(changed)).toBe(hashOf(s1Input()));
  });

  it('TRC-06: the scenario hash changes with the topology, a query or the mapping version', () => {
    const base = hashOf(s1Input());

    const topology = s1Input();
    const firstTable = topology.topology.routeTables[1];
    if (firstTable === undefined) throw new Error('s1 has public-rt');
    firstTable.routes = [];
    expect(hashOf(topology)).not.toBe(base);

    const query = s1Input();
    const first = query.queries[0];
    if (first === undefined) throw new Error('s1 has queries');
    query.queries[0] = { ...first, query: { ...first.query, destinationPort: 8080 } };
    expect(hashOf(query)).not.toBe(base);

    expect(hashOf(s1Input(), GOLDEN_MAPPING_VERSION + 1)).not.toBe(base);
  });

  it('ADR-05: a non-canonical CIDR hashes like its canonical form', () => {
    const input = s1Input();
    const subnet = input.topology.subnets[0];
    if (subnet === undefined) throw new Error('s1 has a subnet');
    subnet.cidrBlock = '10.0.1.7/24';
    expect(hashOf(input)).toBe(hashOf(s1Input()));
  });
});
