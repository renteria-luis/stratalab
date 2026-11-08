import { parseCleanupArgs } from '../args';
import { createAwsPorts } from '../aws/sdk';
import { runCleanup } from '../cleanup';
import { consoleOutput, TerminalPrompt } from '../local';

// pnpm golden:cleanup --account <id> [--dry-run] [--yes]
// Deletes only resources tagged sim:golden=true. Manual only; agents never run it.
const USAGE = 'Usage: pnpm golden:cleanup --account <12-digit id> [--dry-run] [--yes]';

const parsed = parseCleanupArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  console.error(USAGE);
  process.exitCode = 1;
} else {
  process.exitCode = await runCleanup(parsed.value, {
    aws: createAwsPorts,
    prompt: new TerminalPrompt(),
    out: consoleOutput,
  });
}
