import { describe, expect, it } from 'vitest';
import type { ReasonCode, TraceResult } from '../src/index';
import {
  compareAnalysis,
  fixtureVerdict,
  matchAnalyses,
  type FixtureAnalysis,
  type GoldenFixture,
} from '../golden/index';

function evaluated(
  verdict: 'REACHED' | 'BROKE_AT_HOP' | 'ROUTED_THEN_DROPPED',
  reasonCodes: ReasonCode[] = [],
): TraceResult {
  return {
    status: 'evaluated',
    flow: 'F1',
    verdict,
    ...(verdict === 'REACHED'
      ? {}
      : { failure: { direction: 'forward', hopIndex: 2, reasonCodes } }),
    client: { type: 'linux', portRange: { from: 32768, to: 61000 }, sourcePort: 32768 },
    hops: [],
    fidelity: 'Exact',
  };
}

function analysis(networkPathFound: boolean, codes: string[] = []): FixtureAnalysis {
  return {
    queryId: 'q',
    status: 'succeeded',
    networkPathFound,
    forwardPathComponents: [],
    returnPathComponents: [],
    explanations: codes.map((explanationCode) => ({ explanationCode })),
  };
}

describe('golden comparison (docs/specs/p9-golden.md section 6)', () => {
  it('TRC-06: a found path matches REACHED and nothing else', () => {
    expect(compareAnalysis(evaluated('REACHED'), analysis(true))).toEqual({ ok: true });
    expect(
      compareAnalysis(evaluated('REACHED'), analysis(false, ['ENI_SG_RULES_MISMATCH'])),
    ).toMatchObject({
      ok: false,
      problem: 'VERDICT',
    });
    expect(
      compareAnalysis(evaluated('BROKE_AT_HOP', ['NO_ROUTE_TO_DESTINATION']), analysis(true)),
    ).toMatchObject({ ok: false, problem: 'VERDICT' });
    expect(
      compareAnalysis(evaluated('REACHED'), analysis(true, ['ENI_SG_RULES_MISMATCH'])),
    ).toMatchObject({
      ok: false,
      problem: 'CODES',
    });
  });

  it("TRC-06: explanation codes must equal the failing hop's codes, as a set", () => {
    const engine = evaluated('BROKE_AT_HOP', ['NO_ROUTE_TO_DESTINATION']);
    expect(compareAnalysis(engine, analysis(false, ['NO_ROUTE_TO_DESTINATION']))).toEqual({
      ok: true,
    });
    expect(
      compareAnalysis(
        engine,
        analysis(false, ['NO_ROUTE_TO_DESTINATION', 'NO_ROUTE_TO_DESTINATION']),
      ),
    ).toEqual({ ok: true });
    expect(compareAnalysis(engine, analysis(false, ['BAD_STATE_ROUTE']))).toMatchObject({
      ok: false,
      problem: 'CODES',
      engine: { verdict: 'BROKE_AT_HOP', reasonCodes: ['NO_ROUTE_TO_DESTINATION'] },
      fixture: { verdict: 'BROKE_AT_HOP', reasonCodes: ['BAD_STATE_ROUTE'] },
    });
  });

  it('TRC-04: routing codes mean BROKE_AT_HOP and filtering codes ROUTED_THEN_DROPPED', () => {
    expect(fixtureVerdict(analysis(false, ['BAD_STATE_ROUTE']))).toEqual({
      ok: true,
      verdict: 'BROKE_AT_HOP',
      reasonCodes: ['BAD_STATE_ROUTE'],
    });
    expect(
      fixtureVerdict(analysis(false, ['SUBNET_ACL_RESTRICTION', 'ENI_SG_RULES_MISMATCH'])),
    ).toEqual({
      ok: true,
      verdict: 'ROUTED_THEN_DROPPED',
      reasonCodes: ['ENI_SG_RULES_MISMATCH', 'SUBNET_ACL_RESTRICTION'],
    });
    expect(
      compareAnalysis(
        evaluated('ROUTED_THEN_DROPPED', ['ENI_SG_RULES_MISMATCH']),
        analysis(false, ['ENI_SG_RULES_MISMATCH']),
      ),
    ).toEqual({ ok: true });
  });

  it('TRC-06: unmapped, mixed or missing codes fail', () => {
    const engine = evaluated('ROUTED_THEN_DROPPED', ['ENI_SG_RULES_MISMATCH']);
    expect(compareAnalysis(engine, analysis(false, ['SOMETHING_NEW']))).toMatchObject({
      ok: false,
      problem: 'UNMAPPED_CODE',
      codes: ['SOMETHING_NEW'],
    });
    expect(
      compareAnalysis(
        engine,
        analysis(false, ['ENI_SG_RULES_MISMATCH', 'NO_ROUTE_TO_DESTINATION']),
      ),
    ).toMatchObject({ ok: false, problem: 'MIXED_CODES' });
    expect(compareAnalysis(engine, analysis(false))).toMatchObject({
      ok: false,
      problem: 'NO_EXPLANATION',
    });
  });

  it('TRC-06: a blocked engine trace never matches', () => {
    const blocked: TraceResult = { status: 'blocked', issues: [] };
    expect(compareAnalysis(blocked, analysis(true))).toMatchObject({
      ok: false,
      problem: 'BLOCKED',
    });
  });

  it('TRC-06: a fixture has exactly one analysis per query, in query order', () => {
    const fixture = (ids: string[]): Pick<GoldenFixture, 'analyses'> => ({
      analyses: ids.map((queryId) => ({ ...analysis(true), queryId })),
    });
    const scenario = { queries: [{ id: 'a' }, { id: 'b' }] };
    expect(matchAnalyses(fixture(['a', 'b']), scenario)).toEqual([]);
    expect(matchAnalyses(fixture(['a']), scenario)).toEqual(['missing analysis for query b']);
    expect(matchAnalyses(fixture(['a', 'b', 'c']), scenario)).toEqual([
      'analysis c has no query in the scenario',
    ]);
    expect(matchAnalyses(fixture(['b', 'a']), scenario)).toEqual([
      'analyses are not in query order (b, a)',
    ]);
    expect(matchAnalyses(fixture(['a', 'a', 'b']), scenario)).toEqual([
      'duplicate analysis for query a',
    ]);
  });
});
