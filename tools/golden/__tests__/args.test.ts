import { describe, expect, it } from 'vitest';
import { parseCaptureArgs, parseCleanupArgs } from '../src/args';

describe('command-line flags (docs/specs/p9-golden.md section 8)', () => {
  it('TRC-06: --account must be 12 digits and is required without --dry-run', () => {
    expect(parseCaptureArgs(['s1-f1-internet-to-web', '--account', '000000000000'])).toEqual({
      ok: true,
      value: {
        scenarioId: 's1-f1-internet-to-web',
        account: '000000000000',
        dryRun: false,
        yes: false,
        list: false,
      },
    });
    expect(
      parseCaptureArgs(['s1-f1-internet-to-web', '--account=000000000000', '--yes']),
    ).toMatchObject({
      ok: true,
      value: { account: '000000000000', yes: true },
    });
    expect(parseCaptureArgs(['s1-f1-internet-to-web', '--dry-run'])).toMatchObject({
      ok: true,
      value: { dryRun: true, account: undefined },
    });
    expect(parseCaptureArgs(['s1-f1-internet-to-web'])).toEqual({
      ok: false,
      error: '--account <12-digit account ID> is required (or use --dry-run)',
    });
    expect(parseCaptureArgs(['s1-f1-internet-to-web', '--account', '1234'])).toEqual({
      ok: false,
      error: '--account must be a 12-digit account ID',
    });
  });

  it('TRC-06: unknown flags, missing scenario and extra arguments fail', () => {
    expect(parseCaptureArgs(['s1', '--dry-run', '--force'])).toEqual({
      ok: false,
      error: 'Unknown flag --force',
    });
    expect(parseCaptureArgs(['--dry-run'])).toEqual({ ok: false, error: 'Missing <scenario-id>' });
    expect(parseCaptureArgs(['a', 'b', '--dry-run'])).toEqual({
      ok: false,
      error: 'Unexpected argument b',
    });
    expect(parseCaptureArgs(['--list'])).toMatchObject({ ok: true, value: { list: true } });
  });

  it('TRC-06: cleanup takes --account, --dry-run and --yes only', () => {
    expect(parseCleanupArgs(['--account', '000000000000', '--dry-run'])).toEqual({
      ok: true,
      value: { account: '000000000000', dryRun: true, yes: false },
    });
    expect(parseCleanupArgs(['--dry-run'])).toEqual({
      ok: false,
      error: '--account <12-digit account ID> is required',
    });
    expect(parseCleanupArgs(['--account', '000000000000', 's1'])).toEqual({
      ok: false,
      error: 'Unexpected argument s1',
    });
  });
});
