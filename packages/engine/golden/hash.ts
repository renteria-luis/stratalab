import { canonicalJson } from './canonical-json';
import type { GoldenScenario } from './scenario';
import { sha256Hex, utf8Encode } from './sha256';

/**
 * Version of the query → analysis mapping, the stage plan and the comparison rule
 * (docs/specs/p9-golden.md sections 2.2, 2.5 and 6). Bumping it makes every fixture stale.
 */
export const GOLDEN_MAPPING_VERSION = 1;

const HASH_VERSION = 1;

/**
 * Deterministic hash of what a capture depends on: the parsed topology (canonical CIDRs,
 * ADR-05) and the queries. Titles, labels, rule IDs, legs and expected results are left out,
 * so editing them doesn't make a fixture stale (docs/specs/p9-golden.md section 4).
 */
export function scenarioHash(
  scenario: GoldenScenario,
  mappingVersion = GOLDEN_MAPPING_VERSION,
): string {
  const input = {
    hashVersion: HASH_VERSION,
    mappingVersion,
    scenarioId: scenario.id,
    topology: scenario.topology,
    queries: scenario.queries.map((query) => ({ id: query.id, query: query.query })),
  };
  return `sha256:${sha256Hex(utf8Encode(canonicalJson(input)))}`;
}
