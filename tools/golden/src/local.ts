import { mkdir, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { Clock, FixtureStore, Output, Prompt } from './aws/ports';

/** Local (non-AWS) adapters for the CLIs: files, terminal and clock. */

export const FIXTURES_DIR = resolve(
  import.meta.dirname,
  '../../../packages/engine/__tests__/golden/fixtures',
);

export class FileFixtureStore implements FixtureStore {
  async write(scenarioId: string, json: string): Promise<string> {
    const path = join(FIXTURES_DIR, `${scenarioId}.json`);
    const temporary = `${path}.tmp`;
    await writeFile(temporary, json, 'utf8');
    await rename(temporary, path);
    return path;
  }

  /** Raw responses hold real IDs, so they go to the OS temp directory, never the repository. */
  async writeDiagnostics(name: string, json: string): Promise<string> {
    const directory = join(tmpdir(), 'sim-golden-diagnostics');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, `${name}.json`);
    await writeFile(path, json, { encoding: 'utf8', mode: 0o600 });
    return path;
  }
}

export class TerminalPrompt implements Prompt {
  readonly interactive = process.stdin.isTTY;

  async confirm(message: string, expected: string): Promise<boolean> {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await terminal.question(`${message}: `)).trim() === expected;
    } finally {
      terminal.close();
    }
  }
}

export const systemClock: Clock = { now: () => new Date() };

export const consoleOutput: Output = {
  line: (text) => {
    console.log(text);
  },
};
