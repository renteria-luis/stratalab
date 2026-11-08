/** Flag parsing for the golden CLIs (docs/specs/p9-golden.md section 8). No dependencies. */

export type Parsed<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export interface CaptureArgs {
  readonly scenarioId: string;
  readonly account: string | undefined;
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly list: boolean;
}

export interface CleanupArgs {
  readonly account: string;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

interface RawFlags {
  positional: string[];
  account: string | undefined;
  dryRun: boolean;
  yes: boolean;
  list: boolean;
}

function scan(argv: readonly string[], allowed: ReadonlySet<string>): Parsed<RawFlags> {
  const flags: RawFlags = {
    positional: [],
    account: undefined,
    dryRun: false,
    yes: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? '';
    if (!arg.startsWith('--')) {
      flags.positional.push(arg);
      continue;
    }
    const [name = '', inline] = arg.split('=', 2);
    if (!allowed.has(name)) return { ok: false, error: `Unknown flag ${name}` };
    if (name === '--account') {
      const value = inline ?? argv[++index];
      if (value === undefined || !/^\d{12}$/.test(value))
        return { ok: false, error: '--account must be a 12-digit account ID' };
      flags.account = value;
    } else if (inline !== undefined) {
      return { ok: false, error: `${name} takes no value` };
    } else if (name === '--dry-run') flags.dryRun = true;
    else if (name === '--yes') flags.yes = true;
    else flags.list = true;
  }
  return { ok: true, value: flags };
}

export function parseCaptureArgs(argv: readonly string[]): Parsed<CaptureArgs> {
  const scanned = scan(argv, new Set(['--account', '--dry-run', '--yes', '--list']));
  if (!scanned.ok) return scanned;
  const { positional, account, dryRun, yes, list } = scanned.value;
  if (list) return { ok: true, value: { scenarioId: '', account, dryRun, yes, list } };
  const [scenarioId, extra] = positional;
  if (extra !== undefined) return { ok: false, error: `Unexpected argument ${extra}` };
  if (scenarioId === undefined) return { ok: false, error: 'Missing <scenario-id>' };
  if (!dryRun && account === undefined) {
    return { ok: false, error: '--account <12-digit account ID> is required (or use --dry-run)' };
  }
  return { ok: true, value: { scenarioId, account, dryRun, yes, list } };
}

export function parseCleanupArgs(argv: readonly string[]): Parsed<CleanupArgs> {
  const scanned = scan(argv, new Set(['--account', '--dry-run', '--yes']));
  if (!scanned.ok) return scanned;
  const { positional, account, dryRun, yes } = scanned.value;
  const [extra] = positional;
  if (extra !== undefined) return { ok: false, error: `Unexpected argument ${extra}` };
  if (account === undefined)
    return { ok: false, error: '--account <12-digit account ID> is required' };
  return { ok: true, value: { account, dryRun, yes } };
}
