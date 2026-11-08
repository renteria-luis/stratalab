import { findScenario, goldenFixtureSchema, scenarioHash } from '@sim/engine/golden';
import { describe, expect, it } from 'vitest';
import type { RawAnalysis } from '../src/aws/ports';
import { buildIdMap, routeStateProblems, type IdMap } from '../src/id-map';
import { finalizeFixture, normalizeAnalysis } from '../src/normalize';
import { planCapture } from '../src/plan';
import { deploymentOf, realId, realPublicIp } from './fakes/aws';

const ARN = 'arn:aws:ec2:us-east-1:123456789012:network-interface/eni-0123456789abcdef0';

function s1() {
  const scenario = findScenario('s1-f1-internet-to-web');
  if (scenario === undefined) throw new Error('s1 is missing');
  return scenario;
}

const map: IdMap = {
  ids: new Map(
    [
      'igw-0000000a',
      'eni-0000000a',
      'subnet-0000000a',
      'vpc-0a1b2c3d',
      'sg-0000000a',
      'acl-00000001',
      'rtb-00000002',
      'i-0000000a',
    ].map((id) => [realId(id), id]),
  ),
  addresses: new Map([[realPublicIp('203.0.113.25'), '203.0.113.25']]),
};

const raw: RawAnalysis = {
  Status: 'succeeded',
  NetworkPathFound: false,
  ForwardPathComponents: [
    {
      SequenceNumber: 1,
      Component: { Id: realId('igw-0000000a'), Arn: ARN, Name: 'lab-igw' },
      Vpc: { Id: realId('vpc-0a1b2c3d'), Arn: ARN },
      InboundHeader: { DestinationAddresses: [`${realPublicIp('203.0.113.25')}/32`] },
      OutboundHeader: {
        Protocol: '6',
        SourceAddresses: ['198.51.100.7/32'],
        DestinationAddresses: ['10.0.1.10/32'],
        DestinationPortRanges: [{ From: 80, To: 80 }],
      },
    },
    {
      SequenceNumber: 2,
      Component: { Id: realId('acl-00000001') },
      Subnet: { Id: realId('subnet-0000000a') },
      AclRule: {
        Cidr: '0.0.0.0/0',
        Egress: false,
        Protocol: 'all',
        RuleAction: 'allow',
        RuleNumber: 100,
      },
    },
  ],
  ReturnPathComponents: [],
  Explanations: [
    {
      ExplanationCode: 'ENI_SG_RULES_MISMATCH',
      Direction: 'ingress',
      Component: { Id: realId('eni-0000000a'), Arn: ARN, Name: 'web-1' },
      SecurityGroups: [{ Id: realId('sg-0000000a'), Arn: ARN }],
      Addresses: [realPublicIp('203.0.113.25')],
      PortRanges: [{ From: 80, To: 80 }],
    },
  ],
};

describe('normalizer (docs/specs/p9-golden.md section 5.1)', () => {
  it('TRC-06: real IDs become scenario IDs and SDK names map to fixture names', () => {
    const result = normalizeAnalysis('igw-to-web-80', raw, map);
    expect(result).toEqual({
      ok: true,
      analysis: {
        queryId: 'igw-to-web-80',
        status: 'succeeded',
        networkPathFound: false,
        forwardPathComponents: [
          {
            sequenceNumber: 1,
            component: { id: 'igw-0000000a', type: 'internet-gateway' },
            vpc: 'vpc-0a1b2c3d',
            inboundHeader: { destinationAddresses: ['203.0.113.25/32'] },
            outboundHeader: {
              protocol: '6',
              sourceAddresses: ['198.51.100.7/32'],
              destinationAddresses: ['10.0.1.10/32'],
              destinationPortRanges: [{ from: 80, to: 80 }],
            },
          },
          {
            sequenceNumber: 2,
            component: { id: 'acl-00000001', type: 'network-acl' },
            subnet: 'subnet-0000000a',
            aclRule: {
              cidr: '0.0.0.0/0',
              egress: false,
              protocol: 'all',
              ruleAction: 'allow',
              ruleNumber: 100,
            },
          },
        ],
        returnPathComponents: [],
        explanations: [
          {
            explanationCode: 'ENI_SG_RULES_MISMATCH',
            direction: 'ingress',
            component: 'eni-0000000a',
            securityGroups: ['sg-0000000a'],
            addresses: ['203.0.113.25'],
            portRanges: [{ from: 80, to: 80 }],
          },
        ],
      },
    });
  });

  it('TRC-06: ARNs, names, account IDs, Regions and zone IDs are dropped', () => {
    const withAccount: RawAnalysis = {
      ...raw,
      Explanations: [
        {
          ...raw.Explanations?.[0],
          ExplanationCode: 'ENI_SG_RULES_MISMATCH',
          ...({
            ComponentAccount: '123456789012',
            ComponentRegion: 'us-east-1',
            AvailabilityZoneIds: ['use1-az1'],
          } as object),
        },
      ],
    };
    const result = normalizeAnalysis('igw-to-web-80', withAccount, map);
    expect(JSON.stringify(result)).not.toMatch(/arn:|123456789012|use1-az1|web-1|lab-igw/);
  });

  it('TRC-06: an unknown ID stops the capture', () => {
    const unknown: RawAnalysis = {
      ...raw,
      ForwardPathComponents: [{ SequenceNumber: 1, Component: { Id: 'vpc-0ffffffffffffffff' } }],
    };
    expect(normalizeAnalysis('igw-to-web-80', unknown, map)).toEqual({
      ok: false,
      problems: ['igw-to-web-80: unknown ID at forwardPathComponents[0].component'],
    });
  });

  it('TRC-06: a failed analysis stops the capture', () => {
    expect(
      normalizeAnalysis(
        'igw-to-web-80',
        { Status: 'failed', StatusMessage: 'Internal error' },
        map,
      ),
    ).toEqual({
      ok: false,
      problems: ['igw-to-web-80: analysis status is failed (Internal error)'],
    });
  });

  it('TRC-06: the fixture is written only when it parses and the leak check is clean', () => {
    const scenario = s1();
    const analyses = scenario.queries.map((query) => {
      const result = normalizeAnalysis(
        query.id,
        { Status: 'succeeded', NetworkPathFound: true },
        map,
      );
      if (!result.ok) throw new Error(result.problems.join('; '));
      return result.analysis;
    });
    const clean = finalizeFixture(scenario, analyses, '2026-11-05');
    expect(clean.ok).toBe(true);
    if (clean.ok) {
      expect(goldenFixtureSchema.parse(JSON.parse(clean.json))).toEqual(clean.fixture);
      expect(clean.fixture.scenarioHash).toBe(scenarioHash(scenario));
      expect(clean.json.endsWith('}\n')).toBe(true);
    }

    const leaky = analyses.map((analysis, index) =>
      index === 0
        ? { ...analysis, explanations: [{ explanationCode: 'X', address: '54.9.9.9' }] }
        : analysis,
    );
    expect(finalizeFixture(scenario, leaky, '2026-11-05')).toEqual({
      ok: false,
      problems: ['leak at $.analyses[0].explanations[0].address'],
    });
  });
});

describe('ID map (docs/specs/p9-golden.md section 5.1)', () => {
  const plan = planCapture('s1-f1-internet-to-web');
  if (!plan.ok) throw new Error(plan.problems.join('; '));

  it('TRC-06: stack resources, implicit resources, interfaces and public IPs are mapped', () => {
    const deployment = deploymentOf(plan.scenario, plan.logicalIds, plan.resourceTypes);
    const result = buildIdMap(
      plan.scenario,
      plan.logicalIds,
      deployment.resources,
      deployment.snapshot,
    );
    if (!result.ok) throw new Error(result.problems.join('; '));
    expect(Object.fromEntries(result.map.ids)).toEqual(
      Object.fromEntries(
        [
          'vpc-0a1b2c3d',
          'subnet-0000000a',
          'rtb-00000002',
          'igw-0000000a',
          'sg-0000000a',
          'i-0000000a',
          'rtb-00000001',
          'acl-00000001',
          'sg-00000001',
          'eni-0000000a',
        ].map((id) => [realId(id), id]),
      ),
    );
    expect(Object.fromEntries(result.map.addresses)).toEqual({
      [realPublicIp('203.0.113.25')]: '203.0.113.25',
    });
  });

  it('TRC-06: a private address or CIDR that differs from the topology stops the capture', () => {
    const deployment = deploymentOf(plan.scenario, plan.logicalIds, plan.resourceTypes);
    const snapshot = {
      ...deployment.snapshot,
      instances: deployment.snapshot.instances.map((instance) => ({
        ...instance,
        privateIpAddress: '10.0.1.99',
      })),
      subnets: deployment.snapshot.subnets.map((subnet) => ({
        ...subnet,
        cidrBlock: '10.0.9.0/24',
      })),
    };
    expect(buildIdMap(plan.scenario, plan.logicalIds, deployment.resources, snapshot)).toEqual({
      ok: false,
      problems: [
        'subnet-0000000a: deployed CIDR 10.0.9.0/24, topology 10.0.1.0/24',
        'i-0000000a: deployed private address 10.0.1.99, topology 10.0.1.10',
      ],
    });
  });

  it('RT-08: route states must match the topology before any analysis', () => {
    const s4 = planCapture('s4-q8-blackhole');
    if (!s4.ok) throw new Error(s4.problems.join('; '));
    const good = deploymentOf(s4.scenario, s4.logicalIds, s4.resourceTypes);
    const goodMap = buildIdMap(s4.scenario, s4.logicalIds, good.resources, good.snapshot);
    if (!goodMap.ok) throw new Error(goodMap.problems.join('; '));
    expect(routeStateProblems(s4.scenario, good.snapshot, goodMap.map)).toEqual([]);

    const bad = deploymentOf(s4.scenario, s4.logicalIds, s4.resourceTypes, {
      '198.51.100.0/24': 'active',
    });
    expect(routeStateProblems(s4.scenario, bad.snapshot, goodMap.map)).toEqual([
      'rtb-00000002 198.51.100.0/24: deployed state active, expected blackhole',
    ]);
  });
});
