import { describe, expect, it } from 'vitest';
import { trace } from '../../src/index';
import {
  GOLDEN_SCENARIOS,
  checkScenario,
  compareAnalysis,
  findLeaks,
  goldenFixtureSchema,
  matchAnalyses,
  scenarioAllowList,
  scenarioHash,
} from '../../golden/index';

/**
 * Golden tests (TRC-06, docs/specs/p9-golden.md section 6). Fixtures come only from
 * `pnpm golden:capture` (real Reachability Analyzer runs) and are never edited by hand.
 * With no fixtures, only the scenario checks run, and nothing fails.
 */
const fixtures = import.meta.glob('./fixtures/*.json', { eager: true, import: 'default' });

describe('golden scenarios', () => {
  for (const scenario of GOLDEN_SCENARIOS) {
    it(`TRC-06: ${scenario.id} scenario is valid and the engine matches its expected results`, () => {
      expect(checkScenario(scenario)).toEqual([]);
    });
  }

  it('TRC-06: scenario IDs, query IDs and hashes are unique', () => {
    const ids = GOLDEN_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    const hashes = GOLDEN_SCENARIOS.map((scenario) => scenarioHash(scenario));
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const scenario of GOLDEN_SCENARIOS) {
      const queryIds = scenario.queries.map((query) => query.id);
      expect(new Set(queryIds).size).toBe(queryIds.length);
    }
  });
});

for (const [path, raw] of Object.entries(fixtures)) {
  const parsed = goldenFixtureSchema.safeParse(raw);
  const fileId = /([^/]+)\.json$/.exec(path)?.[1] ?? path;

  describe(`golden fixture ${fileId}`, () => {
    if (!parsed.success) {
      it(`TRC-06: ${fileId} fixture parses`, () => {
        expect(parsed.error.issues).toEqual([]);
      });
      return;
    }
    const fixture = parsed.data;
    const scenario = GOLDEN_SCENARIOS.find((candidate) => candidate.id === fixture.scenarioId);

    it(`TRC-06: ${fileId} fixture belongs to a scenario with the same ID`, () => {
      expect(fixture.scenarioId).toBe(fileId);
      expect(scenario?.id).toBe(fixture.scenarioId);
    });
    if (scenario === undefined) return;

    it(`TRC-06: ${fileId} fixture holds no real IDs, ARNs or addresses`, () => {
      expect(findLeaks(raw, scenarioAllowList(scenario))).toEqual([]);
    });

    const currentHash = scenarioHash(scenario);
    it(`TRC-06: ${fileId} fixture is not stale`, () => {
      expect(
        fixture.scenarioHash,
        `The scenario changed after this capture. Re-run pnpm golden:capture ${scenario.id}`,
      ).toBe(currentHash);
    });
    if (fixture.scenarioHash !== currentHash) return;

    it(`TRC-06: ${fileId} fixture has one analysis per query and the scenario's region`, () => {
      expect(matchAnalyses(fixture, scenario)).toEqual([]);
      expect(fixture.region).toBe(scenario.topology.region);
    });

    for (const query of scenario.queries) {
      const analysis = fixture.analyses.find((candidate) => candidate.queryId === query.id);
      if (analysis === undefined) continue;
      it(`${query.ruleIds.join(' ')}: ${scenario.id} ${query.id} matches Reachability Analyzer`, () => {
        expect(compareAnalysis(trace(scenario.topology, query.query), analysis)).toEqual({
          ok: true,
        });
      });
    }
  });
}
