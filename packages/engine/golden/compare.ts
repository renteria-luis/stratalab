import type { TraceResult, Verdict } from '../src/index';
import { isFilteringCode, isRoutingCode } from './codes';
import type { FixtureAnalysis, GoldenFixture } from './fixture';

/**
 * One-to-one comparison of an engine trace with a Reachability Analyzer result (TRC-06,
 * docs/specs/p9-golden.md section 6). Direction and hop index aren't compared: Reachability
 * Analyzer has no such index.
 */

export interface VerdictAndCodes {
  readonly verdict: Verdict;
  /** Sorted, without duplicates. */
  readonly reasonCodes: readonly string[];
}

export type FixtureVerdict =
  | ({ readonly ok: true } & VerdictAndCodes)
  | {
      readonly ok: false;
      readonly problem: 'UNMAPPED_CODE' | 'MIXED_CODES' | 'NO_EXPLANATION';
      readonly codes: readonly string[];
    };

export type CompareOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: 'BLOCKED'; readonly blocked: readonly string[] }
  | {
      readonly ok: false;
      readonly problem: 'UNMAPPED_CODE' | 'MIXED_CODES' | 'NO_EXPLANATION';
      readonly codes: readonly string[];
      readonly engine: VerdictAndCodes;
    }
  | {
      readonly ok: false;
      readonly problem: 'VERDICT' | 'CODES';
      readonly engine: VerdictAndCodes;
      readonly fixture: VerdictAndCodes;
    };

const sortedUnique = (codes: readonly string[]) => [...new Set(codes)].sort();

/**
 * The verdict a fixture analysis means: a found path is `REACHED`; otherwise the TRC-04
 * group of its explanation codes decides (TRC-02).
 */
export function fixtureVerdict(analysis: FixtureAnalysis): FixtureVerdict {
  const codes = sortedUnique(
    analysis.explanations.map((explanation) => explanation.explanationCode),
  );
  if (analysis.networkPathFound) return { ok: true, verdict: 'REACHED', reasonCodes: codes };
  if (codes.length === 0) return { ok: false, problem: 'NO_EXPLANATION', codes };
  const unmapped = codes.filter((code) => !isRoutingCode(code) && !isFilteringCode(code));
  if (unmapped.length > 0) return { ok: false, problem: 'UNMAPPED_CODE', codes: unmapped };
  const routing = codes.some(isRoutingCode);
  if (routing && codes.some(isFilteringCode)) return { ok: false, problem: 'MIXED_CODES', codes };
  return {
    ok: true,
    verdict: routing ? 'BROKE_AT_HOP' : 'ROUTED_THEN_DROPPED',
    reasonCodes: codes,
  };
}

export function compareAnalysis(result: TraceResult, analysis: FixtureAnalysis): CompareOutcome {
  if (result.status === 'blocked') {
    return { ok: false, problem: 'BLOCKED', blocked: result.issues.map((issue) => issue.code) };
  }
  const engine: VerdictAndCodes = {
    verdict: result.verdict,
    reasonCodes: sortedUnique(result.failure?.reasonCodes ?? []),
  };
  const fromFixture = fixtureVerdict(analysis);
  if (!fromFixture.ok) {
    return { ok: false, problem: fromFixture.problem, codes: fromFixture.codes, engine };
  }
  const fixture: VerdictAndCodes = {
    verdict: fromFixture.verdict,
    reasonCodes: fromFixture.reasonCodes,
  };
  if (engine.verdict !== fixture.verdict) return { ok: false, problem: 'VERDICT', engine, fixture };
  const sameCodes =
    engine.reasonCodes.length === fixture.reasonCodes.length &&
    engine.reasonCodes.every((code, index) => code === fixture.reasonCodes[index]);
  if (!sameCodes) return { ok: false, problem: 'CODES', engine, fixture };
  return { ok: true };
}

/** Problems with how a fixture's analyses line up with the scenario's queries. */
export function matchAnalyses(
  fixture: Pick<GoldenFixture, 'analyses'>,
  scenario: { readonly queries: readonly { readonly id: string }[] },
): string[] {
  const problems: string[] = [];
  const analysisIds = fixture.analyses.map((analysis) => analysis.queryId);
  const queryIds = scenario.queries.map((query) => query.id);

  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const id of analysisIds) {
    if (seen.has(id) && !reported.has(id)) {
      problems.push(`duplicate analysis for query ${id}`);
      reported.add(id);
    }
    seen.add(id);
  }
  for (const id of queryIds) {
    if (!seen.has(id)) problems.push(`missing analysis for query ${id}`);
  }
  for (const id of new Set(analysisIds)) {
    if (!queryIds.includes(id)) problems.push(`analysis ${id} has no query in the scenario`);
  }
  if (problems.length === 0 && analysisIds.join('\n') !== queryIds.join('\n')) {
    problems.push(`analyses are not in query order (${analysisIds.join(', ')})`);
  }
  return problems;
}
