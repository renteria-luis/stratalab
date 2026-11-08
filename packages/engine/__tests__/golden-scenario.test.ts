import { describe, expect, it } from 'vitest';
import {
  GOLDEN_SCENARIO_INPUTS,
  checkScenario,
  goldenScenarioSchema,
  type GoldenScenarioInput,
} from '../golden/index';

function s1Input(): GoldenScenarioInput {
  const input = GOLDEN_SCENARIO_INPUTS.find((scenario) => scenario.id === 's1-f1-internet-to-web');
  if (input === undefined) throw new Error('s1 is missing');
  return JSON.parse(JSON.stringify(input)) as GoldenScenarioInput;
}

function problemsOf(edit: (input: GoldenScenarioInput) => void): string[] {
  const input = s1Input();
  edit(input);
  return checkScenario(goldenScenarioSchema.parse(input));
}

function firstQuery(input: GoldenScenarioInput) {
  const query = input.queries[0];
  if (query === undefined) throw new Error('s1 has queries');
  return query;
}

describe('golden scenario self-checks (docs/specs/p9-golden.md section 2.1)', () => {
  it('TRC-06: S1 passes its self-checks', () => {
    expect(problemsOf(() => undefined)).toEqual([]);
  });

  it('TRC-06: a query whose engine result differs from expected is reported', () => {
    expect(
      problemsOf((input) => {
        firstQuery(input).expected = {
          verdict: 'BROKE_AT_HOP',
          direction: 'forward',
          hopIndex: 0,
          reasonCodes: ['NO_ROUTE_TO_DESTINATION'],
        };
      }),
    ).toEqual([
      'igw-to-web-80: engine gives {"verdict":"REACHED"}, expected {"verdict":"BROKE_AT_HOP","direction":"forward","hopIndex":0,"reasonCodes":["NO_ROUTE_TO_DESTINATION"]}',
    ]);
  });

  it('TRC-06: a query that depends on NO_LISTENER is rejected (no listener check in Reachability Analyzer)', () => {
    const problems = problemsOf((input) => {
      const query = firstQuery(input);
      query.query = { ...query.query, destinationPort: 8080 };
      query.expected = {
        verdict: 'ROUTED_THEN_DROPPED',
        direction: 'forward',
        hopIndex: 2,
        reasonCodes: ['ENI_SG_RULES_MISMATCH'],
      };
      const web = input.topology.securityGroups[1];
      if (web === undefined) throw new Error('s1 has the web group');
      web.inboundRules = [
        {
          id: 'sgr-0000000a',
          protocol: 'tcp',
          fromPort: 0,
          toPort: 65535,
          peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' },
        },
      ];
    });
    expect(problems).toContain(
      'igw-to-web-80: the engine result uses NO_LISTENER, which no analysis can confirm',
    );
  });

  it('TRC-06: unsupported query shapes, platforms and public IP kinds are rejected', () => {
    expect(
      problemsOf((input) => {
        const query = firstQuery(input);
        query.query = {
          ...query.query,
          destination: { type: 'instance', instanceId: 'i-0000000a', address: 'private' },
        };
      }),
    ).toContain(
      'igw-to-web-80: unsupported query shape (only internet → instance public and instance → internet)',
    );
    expect(
      problemsOf((input) => {
        const instance = input.topology.instances[0];
        if (instance === undefined) throw new Error('s1 has web-1');
        instance.platform = 'windows';
      }),
    ).toContain('i-0000000a: only linux instances can be deployed');
    expect(
      problemsOf((input) => {
        const instance = input.topology.instances[0];
        if (instance === undefined) throw new Error('s1 has web-1');
        instance.primaryNetworkInterface.publicIp = { kind: 'elastic-ip', address: '203.0.113.25' };
      }),
    ).toContain('i-0000000a: only auto-assigned public IPv4 addresses can be deployed');
  });

  it('TRC-06: query IDs are unique within a scenario', () => {
    expect(() =>
      goldenScenarioSchema.parse({
        ...s1Input(),
        queries: [firstQuery(s1Input()), firstQuery(s1Input())],
      }),
    ).toThrow();
  });
});
