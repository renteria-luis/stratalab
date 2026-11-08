/**
 * Golden tests with Reachability Analyzer (TRC-06, docs/specs/p9-golden.md): scenarios, the
 * scenario hash, the fixture schema, the comparison and the leak check. Pure and
 * deterministic like the engine; `tools/golden` imports it as `@sim/engine/golden`.
 */
export { canonicalJson } from './canonical-json';
export { FILTERING_CODES, ROUTING_CODES, isFilteringCode, isRoutingCode } from './codes';
export {
  compareAnalysis,
  fixtureVerdict,
  matchAnalyses,
  type CompareOutcome,
  type FixtureVerdict,
  type VerdictAndCodes,
} from './compare';
export {
  COMPONENT_TYPES,
  fixtureAnalysisSchema,
  fixtureComponentSchema,
  fixtureExplanationSchema,
  goldenFixtureSchema,
  type ComponentType,
  type FixtureAnalysis,
  type FixtureComponent,
  type FixtureExplanation,
  type GoldenFixture,
} from './fixture';
export { GOLDEN_MAPPING_VERSION, scenarioHash } from './hash';
export { findLeaks, scenarioAllowList, type AllowList } from './leaks';
export {
  checkScenario,
  goldenExpectedSchema,
  goldenQuerySchema,
  goldenScenarioSchema,
  goldenTraceQuerySchema,
  summarizeTrace,
  type GoldenExpected,
  type GoldenQuery,
  type GoldenScenario,
  type GoldenScenarioInput,
} from './scenario';
export { GOLDEN_SCENARIOS, GOLDEN_SCENARIO_INPUTS, findScenario } from './scenarios/index';
export { lab1Topology } from './scenarios/lab1';
export { sha256Hex, utf8Encode } from './sha256';
