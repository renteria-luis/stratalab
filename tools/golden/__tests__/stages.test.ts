import { topologySchema, validate, type TopologyInput } from '@sim/engine';
import { findScenario, lab1Topology } from '@sim/engine/golden';
import { describe, expect, it } from 'vitest';
import { planStages } from '../src/cdk/stages';
import { synthesize } from '../src/cdk/translate';

function scenario(id: string) {
  const found = findScenario(id);
  if (found === undefined) throw new Error(`${id} is missing`);
  return found;
}

describe('stage plan (docs/specs/p9-golden.md section 2.5)', () => {
  it('TRC-06: a topology without routes to detached gateways has one stage', () => {
    const plan = planStages(scenario('s1-f1-internet-to-web').topology);
    expect(plan).toMatchObject({ ok: true });
    if (!plan.ok) return;
    expect(plan.stages.map((stage) => stage.label)).toEqual(['final']);
    expect(plan.stages[0]?.topology).toEqual(scenario('s1-f1-internet-to-web').topology);
  });

  it('RT-08: a route to a detached gateway builds in three valid stages', () => {
    const s4 = scenario('s4-q8-blackhole');
    const plan = planStages(s4.topology);
    if (!plan.ok) throw new Error(plan.errors.map((error) => error.message).join('; '));
    expect(plan.stages).toHaveLength(3);
    const [first, second, last] = plan.stages.map((stage) => stage.topology);

    expect(first?.instances).toEqual([]);
    expect(first?.internetGateways).toEqual([
      { id: 'igw-0000000a', name: 'lab-igw' },
      { id: 'igw-0000000b', name: 'spare-igw', attachedVpcId: 'vpc-0a1b2c3d' },
    ]);
    expect(first?.routeTables[1]?.routes.map((route) => route.destinationCidrBlock)).toEqual([
      '198.51.100.0/24',
    ]);

    expect(second?.instances).toEqual([]);
    expect(second?.internetGateways.every((gateway) => gateway.attachedVpcId === undefined)).toBe(
      true,
    );
    expect(second?.routeTables).toEqual(first?.routeTables);

    expect(last).toEqual(s4.topology);

    for (const stage of plan.stages) {
      expect(() => topologySchema.parse(stage.topology)).not.toThrow();
      expect(validate(stage.topology).filter((issue) => issue.severity === 'error')).toEqual([]);
    }
  });

  it('RT-08: between stages resources are only added or removed, never changed or replaced', () => {
    // CloudFormation replaces a resource whose properties change, and recreating the route to a
    // detached gateway fails (CreateRoute needs an attached gateway). So every resource two
    // consecutive stages share must keep its logical ID and its properties.
    const plan = planStages(scenario('s4-q8-blackhole').topology);
    if (!plan.ok) throw new Error('s4 has a stage plan');
    const templates = plan.stages.map((stage) => {
      const body = JSON.parse(synthesize('sim-golden-test', stage.topology).body) as {
        Resources: Record<string, { Properties?: unknown }>;
      };
      return body.Resources;
    });
    for (let index = 1; index < templates.length; index++) {
      const before = templates[index - 1] ?? {};
      const after = templates[index] ?? {};
      for (const [logicalId, resource] of Object.entries(after)) {
        const previous = before[logicalId];
        if (previous !== undefined)
          expect(resource.Properties, logicalId).toEqual(previous.Properties);
      }
    }
    const blackhole = Object.entries(templates[0] ?? {}).find(
      ([, resource]) =>
        (resource.Properties as { DestinationCidrBlock?: string } | undefined)
          ?.DestinationCidrBlock === '198.51.100.0/24',
    );
    expect(blackhole?.[0]).toBe('Rtb00000002Route198d51d100d0s24');
    expect(templates[2]?.Rtb00000002Route198d51d100d0s24).toBeDefined();
  });

  it('RT-08: two routed detached gateways in one VPC are rejected', () => {
    const input: TopologyInput = lab1Topology(true);
    input.internetGateways.push({ id: 'igw-0000000b' }, { id: 'igw-0000000c' });
    const table = input.routeTables[1];
    if (table === undefined) throw new Error('lab 1 has public-rt');
    table.routes.push(
      {
        destinationCidrBlock: '198.51.100.0/24',
        target: { type: 'internet-gateway', internetGatewayId: 'igw-0000000b' },
      },
      {
        destinationCidrBlock: '192.0.2.0/24',
        target: { type: 'internet-gateway', internetGatewayId: 'igw-0000000c' },
      },
    );
    const plan = planStages(topologySchema.parse(input));
    expect(plan).toMatchObject({ ok: false, errors: [{ code: 'GOLDEN_DETACHED_ROUTES' }] });
  });
});
