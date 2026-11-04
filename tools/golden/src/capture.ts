// Placeholder for `pnpm golden:capture <scenario-id>`. The real tool (deploy a scenario,
// run Reachability Analyzer, save the fixture, destroy the stack) is built later.
// It must only ever be run by a human with a sandbox AWS profile (see AGENTS.md).
const scenarioId = process.argv[2] ?? '<scenario-id>';
console.error(`golden:capture is not implemented yet (scenario: ${scenarioId}).`);
process.exit(1);
