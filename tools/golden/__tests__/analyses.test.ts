import { findScenario, goldenScenarioSchema, GOLDEN_SCENARIO_INPUTS } from '@sim/engine/golden';
import { describe, expect, it } from 'vitest';
import { pathRequest } from '../src/analyses';

function scenario(id: string) {
  const found = findScenario(id);
  if (found === undefined) throw new Error(`${id} is missing`);
  return found;
}

function query(scenarioId: string, queryId: string) {
  const found = scenario(scenarioId).queries.find((candidate) => candidate.id === queryId);
  if (found === undefined) throw new Error(`${queryId} is missing`);
  return found;
}

const asIs = (id: string) => id;

describe('query → analysis mapping (docs/specs/p9-golden.md section 2.2)', () => {
  it('TRC-06: internet → instance uses the internet gateway as source and FilterAtSource', () => {
    const s1 = scenario('s1-f1-internet-to-web');
    expect(pathRequest(s1, query(s1.id, 'igw-to-web-80'), asIs)).toEqual({
      Source: 'igw-0000000a',
      Destination: 'i-0000000a',
      Protocol: 'tcp',
      FilterAtSource: {
        SourceAddress: '198.51.100.7',
        SourcePortRange: { FromPort: 32768, ToPort: 32768 },
        DestinationPortRange: { FromPort: 80, ToPort: 80 },
      },
    });
  });

  it('TRC-06: instance → internet uses the internet gateway as destination', () => {
    const s1 = scenario('s1-f1-internet-to-web');
    expect(pathRequest(s1, query(s1.id, 'web-80-to-igw'), asIs)).toEqual({
      Source: 'i-0000000a',
      Destination: 'igw-0000000a',
      Protocol: 'tcp',
      FilterAtSource: {
        SourcePortRange: { FromPort: 80, ToPort: 80 },
        DestinationAddress: '198.51.100.7',
        DestinationPortRange: { FromPort: 32768, ToPort: 32768 },
      },
    });
  });

  it('TRC-06: scenario IDs are resolved to real IDs', () => {
    const s1 = scenario('s1-f1-internet-to-web');
    const request = pathRequest(s1, query(s1.id, 'igw-to-web-80'), (id) => `real-${id}`);
    expect(request.Source).toBe('real-igw-0000000a');
    expect(request.Destination).toBe('real-i-0000000a');
  });

  it('TRC-06: other query shapes are rejected', () => {
    const input = GOLDEN_SCENARIO_INPUTS[0];
    if (input === undefined) throw new Error('s1 is missing');
    const changed = JSON.parse(JSON.stringify(input)) as typeof input;
    const first = changed.queries[0];
    if (first === undefined) throw new Error('s1 has queries');
    first.query = {
      ...first.query,
      destination: { type: 'instance', instanceId: 'i-0000000a', address: 'private' },
    };
    const parsedScenario = goldenScenarioSchema.parse(changed);
    const parsedQuery = parsedScenario.queries[0];
    if (parsedQuery === undefined) throw new Error('s1 has queries');
    expect(() => pathRequest(parsedScenario, parsedQuery, asIs)).toThrow(/GOLDEN_QUERY_SHAPE/);
  });
});
