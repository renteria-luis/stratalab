import {
  associateRouteTable,
  replaceSecurityGroupRules,
  topologySchema,
  trace,
  validate,
  type TraceResult,
} from '@sim/engine';
import { describe, expect, it } from 'vitest';
import { LABS, checkLab, labSchema, lab01, type ExpectedResult } from '../src/index';

/** The result `trace` gives, in the shape a lab declares it. */
function summary(result: TraceResult): ExpectedResult | { blocked: string[] } {
  if (result.status === 'blocked') return { blocked: result.issues.map((issue) => issue.code) };
  if (result.verdict === 'REACHED') return { verdict: 'REACHED' };
  if (result.failure === undefined) throw new Error('A failed trace has a failure');
  return {
    verdict: result.verdict,
    direction: result.failure.direction,
    hopIndex: result.failure.hopIndex,
    reasonCodes: [...result.failure.reasonCodes],
  };
}

describe('lab 1: Web server not reachable', () => {
  it('LAB: every lab passes its schema and has unique query IDs', () => {
    for (const lab of LABS) {
      expect(() => labSchema.parse(lab)).not.toThrow();
      expect(new Set(lab.queries.map((query) => query.id)).size).toBe(lab.queries.length);
    }
  });

  it('LAB: both topologies are schema-valid and have no validate() issues', () => {
    for (const topology of [lab01.initialTopology, lab01.solutionTopology]) {
      expect(topologySchema.parse(topology)).toEqual(topology);
      expect(validate(topology)).toEqual([]);
    }
  });

  it.each(lab01.queries.map((query) => [query.id, query] as const))(
    'TRC-02: query %s gives the declared result on the initial topology',
    (_id, query) => {
      expect(summary(trace(lab01.initialTopology, query.query))).toEqual(query.expected.initial);
    },
  );

  it.each(lab01.queries.map((query) => [query.id, query] as const))(
    'TRC-02: query %s gives the declared result on the solution topology',
    (_id, query) => {
      expect(summary(trace(lab01.solutionTopology, query.query))).toEqual(query.expected.solution);
    },
  );

  it('SG-02: the initial topology fails at the security group, forward hop 2', () => {
    expect(lab01.queries[0]?.expected.initial).toEqual({
      verdict: 'ROUTED_THEN_DROPPED',
      direction: 'forward',
      hopIndex: 2,
      reasonCodes: ['ENI_SG_RULES_MISMATCH'],
    });
  });

  it('IGW-04: fixing only the security group exposes the missing return route', () => {
    const web = lab01.initialTopology.securityGroups.find((group) => group.name === 'web');
    const fixed = replaceSecurityGroupRules(lab01.initialTopology, web?.id ?? '', 'inbound', [
      { protocol: 'tcp', fromPort: 80, toPort: 80, peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
    ]);
    if (!fixed.ok) throw new Error(fixed.error.code);
    const query = lab01.queries[0];
    if (query === undefined) throw new Error('Lab 1 has a web query');
    expect(summary(trace(fixed.topology, query.query))).toEqual({
      verdict: 'BROKE_AT_HOP',
      direction: 'return',
      hopIndex: 6,
      reasonCodes: ['NO_ROUTE_TO_DESTINATION'],
    });
    const associated = associateRouteTable(fixed.topology, 'subnet-0000000a', 'rtb-00000002');
    if (!associated.ok) throw new Error(associated.error.code);
    expect(checkLab(lab01, associated.topology).complete).toBe(true);
  });

  it('LAB: checkLab is incomplete on the initial topology and complete on the solution', () => {
    expect(checkLab(lab01, lab01.initialTopology).complete).toBe(false);
    expect(checkLab(lab01, lab01.solutionTopology).complete).toBe(true);
  });

  it('SG-02: opening all traffic to the internet fails the SSH guard', () => {
    const web = lab01.solutionTopology.securityGroups.find((group) => group.name === 'web');
    const open = replaceSecurityGroupRules(lab01.solutionTopology, web?.id ?? '', 'inbound', [
      { protocol: 'all', peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' } },
    ]);
    if (!open.ok) throw new Error(open.error.code);
    const check = checkLab(lab01, open.topology);
    expect(check.complete).toBe(false);
    expect(check.results.find((result) => result.queryId === 'ssh-stays-closed')?.passed).toBe(
      false,
    );
  });

  it('LAB: a topology with validate() errors never completes the lab', () => {
    const broken = topologySchema.parse({
      ...lab01.solutionTopology,
      subnets: [
        ...lab01.solutionTopology.subnets,
        {
          id: 'subnet-0000000b',
          vpcId: 'vpc-0a1b2c3d',
          cidrBlock: '10.0.1.0/25',
          availabilityZone: 'us-east-1a',
        },
      ],
    });
    expect(checkLab(lab01, broken).complete).toBe(false);
  });

  it('LAB: every text has English and Spanish, and hints are opt-in data', () => {
    const texts = [lab01.title, lab01.summary, lab01.story, lab01.goal, ...lab01.hints];
    for (const text of texts) {
      expect(text.en.trim()).not.toBe('');
      expect(text.es.trim()).not.toBe('');
    }
    expect(lab01.hints.length).toBeGreaterThan(0);
  });
});
