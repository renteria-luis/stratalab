import { describe, expect, it } from 'vitest';
import type { TaggedResource } from '../src/aws/ports';
import { runCleanup, type CleanupOptions } from '../src/cleanup';
import { FakeAws, FakeOutput, FakePrompt } from './fakes/aws';

const ACCOUNT = '000000000000';
const golden = [{ key: 'sim:golden', value: 'true' }];

function resource(kind: TaggedResource['kind'], id: string, tags = golden): TaggedResource {
  return {
    kind,
    id,
    tags,
    ...(kind === 'internet-gateway' ? { attachedVpcId: 'vpc-0fe0000000000001' } : {}),
  };
}

function setup() {
  const aws = new FakeAws();
  const out = new FakeOutput();
  const run = (options: Partial<CleanupOptions> = {}, prompt = new FakePrompt(true, 'delete')) =>
    runCleanup(
      { account: ACCOUNT, dryRun: false, yes: false, ...options },
      { aws: () => aws, prompt, out },
    );
  return { aws, out, run };
}

describe('cleanup (docs/specs/p9-golden.md section 8.3)', () => {
  it('TRC-06: nothing tagged means nothing to do', async () => {
    const { run, out, aws } = setup();
    expect(await run()).toBe(0);
    expect(out.text).toContain('Nothing to clean up.');
    expect(aws.calls.some((call) => call.includes('remove') || call.includes('delete'))).toBe(
      false,
    );
  });

  it('TRC-06: account and region checks come first', async () => {
    const wrongAccount = setup();
    wrongAccount.aws.account = '111111111111';
    expect(await wrongAccount.run()).toBe(1);
    expect(wrongAccount.aws.calls).toEqual(['identity.accountId']);

    const wrongRegion = setup();
    wrongRegion.aws.regionName = 'eu-west-1';
    expect(await wrongRegion.run()).toBe(1);
    expect(wrongRegion.aws.calls).toEqual(['identity.accountId', 'identity.region']);
  });

  it('TRC-06: cleanup deletes in dependency order and only resources tagged sim:golden=true', async () => {
    const { run, aws } = setup();
    aws.taggedAnalyses = ['nia-00000000000000001'];
    aws.taggedPaths = ['nip-00000000000000001'];
    aws.goldenStacks = ['sim-golden-s1-f1-internet-to-web'];
    aws.taggedResources = [
      resource('vpc', 'vpc-0fe0000000000001'),
      resource('security-group', 'sg-0fe0000000000001'),
      resource('subnet', 'subnet-0fe0000000000001'),
      resource('instance', 'i-0fe0000000000001'),
      resource('route-table', 'rtb-0fe0000000000001'),
      resource('internet-gateway', 'igw-0fe0000000000001'),
      resource('network-acl', 'acl-0fe0000000000001'),
      resource('vpc', 'vpc-0fe0000000000099', [{ key: 'Name', value: 'not ours' }]),
    ];
    expect(await run()).toBe(0);
    const deletions = aws.calls.filter(
      (call) =>
        call.startsWith('reachability.delete') ||
        call.startsWith('stacks.remove') ||
        call.startsWith('inventory.remove'),
    );
    expect(deletions).toEqual([
      'reachability.deleteAnalysis nia-00000000000000001',
      'reachability.deletePath nip-00000000000000001',
      'stacks.remove sim-golden-s1-f1-internet-to-web',
      'inventory.remove instance i-0fe0000000000001',
      'inventory.remove internet-gateway igw-0fe0000000000001',
      'inventory.remove subnet subnet-0fe0000000000001',
      'inventory.remove route-table rtb-0fe0000000000001',
      'inventory.remove network-acl acl-0fe0000000000001',
      'inventory.remove security-group sg-0fe0000000000001',
      'inventory.remove vpc vpc-0fe0000000000001',
    ]);
    expect(aws.taggedResources.map((item) => item.id)).toEqual(['vpc-0fe0000000000099']);
  });

  it('TRC-06: a clean run exits 0', async () => {
    const { run, aws } = setup();
    aws.taggedPaths = ['nip-00000000000000001'];
    expect(await run({ yes: true })).toBe(0);
    expect(aws.taggedPaths).toEqual([]);
  });

  it('TRC-06: the dry run deletes nothing', async () => {
    const { run, aws, out } = setup();
    aws.taggedPaths = ['nip-00000000000000001'];
    aws.taggedResources = [resource('vpc', 'vpc-0fe0000000000001')];
    expect(await run({ dryRun: true })).toBe(0);
    expect(aws.calls.some((call) => call.includes('remove') || call.includes('delete'))).toBe(
      false,
    );
    expect(out.text).toContain('nip-00000000000000001');
    expect(out.text).toContain('vpc vpc-0fe0000000000001');
  });

  it('TRC-06: without confirmation nothing is deleted', async () => {
    const { run, aws } = setup();
    aws.taggedPaths = ['nip-00000000000000001'];
    expect(await run({}, new FakePrompt(true, 'no'))).toBe(1);
    expect(aws.taggedPaths).toEqual(['nip-00000000000000001']);
  });
});
