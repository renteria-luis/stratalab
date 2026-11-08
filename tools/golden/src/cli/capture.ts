import { GOLDEN_SCENARIOS, scenarioHash } from '@sim/engine/golden';
import { parseCaptureArgs } from '../args';
import { createAwsPorts } from '../aws/sdk';
import { runCapture } from '../capture';
import { consoleOutput, FileFixtureStore, systemClock, TerminalPrompt } from '../local';

// pnpm golden:capture <scenario-id> [--dry-run | --account <id> [--yes]] | --list
// Manual only, costs money (AGENTS.md, "Golden capture"). Agents never run it.
const USAGE =
  'Usage: pnpm golden:capture --list | <scenario-id> --dry-run | <scenario-id> --account <12-digit id> [--yes]';

const parsed = parseCaptureArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  console.error(USAGE);
  process.exitCode = 1;
} else if (parsed.value.list) {
  for (const scenario of GOLDEN_SCENARIOS) {
    console.log(
      `${scenario.id}  ${scenarioHash(scenario)}  ${String(scenario.queries.length)} analyses  ${scenario.title}`,
    );
  }
} else {
  const { scenarioId, account, dryRun, yes } = parsed.value;
  const controller = new AbortController();
  let interrupts = 0;
  process.on('SIGINT', () => {
    interrupts++;
    if (interrupts === 1) {
      console.error(
        'Stopping after the current step, then tearing down. Press Ctrl+C again to exit now.',
      );
      controller.abort();
      return;
    }
    console.error(
      `Exiting now. Run pnpm golden:cleanup --account ${account ?? '<id>'} to delete leftovers.`,
    );
    process.exit(130);
  });
  process.exitCode = await runCapture(
    { scenarioId, account, dryRun, yes },
    {
      aws: createAwsPorts,
      fixtures: new FileFixtureStore(),
      prompt: new TerminalPrompt(),
      clock: systemClock,
      out: consoleOutput,
      signal: controller.signal,
    },
  );
}
