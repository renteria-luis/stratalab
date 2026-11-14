import { describe, expect, it } from 'vitest';
import { goldenFixtureSchema } from '../golden/index';

/** Fixture schema additions for NAT gateways (docs/specs/p9-golden.md section 15.3). */

const analysis = (component: unknown, explanation: unknown) => ({
  queryId: 'app-to-igw-443',
  status: 'succeeded',
  networkPathFound: false,
  forwardPathComponents: [component],
  returnPathComponents: [],
  explanations: [explanation],
});

const fixture = (component: unknown, explanation: unknown) => ({
  fixtureVersion: 1,
  scenarioId: 's6-f3-nat',
  scenarioHash: `sha256:${'0'.repeat(64)}`,
  capturedAt: '2026-11-14',
  region: 'us-east-1',
  analyses: [analysis(component, explanation)],
});

describe('golden fixture schema', () => {
  it('TRC-06: the fixture schema accepts NAT gateway components, routes and explanations', () => {
    const parsed = goldenFixtureSchema.safeParse(
      fixture(
        {
          sequenceNumber: 4,
          component: { id: 'nat-0000000a', type: 'nat-gateway' },
          routeTableRoute: {
            destinationCidr: '0.0.0.0/0',
            natGatewayId: 'nat-0000000a',
            origin: 'createroute',
            state: 'active',
          },
        },
        { explanationCode: 'NO_ROUTE_TO_DESTINATION', natGateway: 'nat-0000000a' },
      ),
    );
    expect(parsed.success).toBe(true);
  });

  it('TRC-06: unknown component types and fields are still rejected', () => {
    expect(
      goldenFixtureSchema.safeParse(
        fixture(
          { sequenceNumber: 1, component: { id: 'tgw-0000000a', type: 'transit-gateway' } },
          {
            explanationCode: 'X',
          },
        ),
      ).success,
    ).toBe(false);
    expect(
      goldenFixtureSchema.safeParse(
        fixture(
          { sequenceNumber: 1, component: { id: 'nat-0000000a', type: 'nat-gateway' } },
          { explanationCode: 'X', transitGateway: 'tgw-0000000a' },
        ),
      ).success,
    ).toBe(false);
  });
});
