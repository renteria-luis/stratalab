import { trace } from '@sim/engine';
import { compareAnalysis, goldenFixtureSchema } from '@sim/engine/golden';
import { describe, expect, it } from 'vitest';
import type { AwsFactory, PathRequest, RawAnalysis } from '../src/aws/ports';
import { runCapture, type CaptureOptions } from '../src/capture';
import { planCapture } from '../src/plan';
import {
  FakeAws,
  FakeFixtureStore,
  FakeOutput,
  FakePrompt,
  deploymentOf,
  fixedClock,
  realId,
} from './fakes/aws';

const ACCOUNT = '000000000000';

function setup(scenarioId: string, routeStates: Record<string, string> = {}) {
  const plan = planCapture(scenarioId);
  if (!plan.ok) throw new Error(plan.problems.join('; '));
  const aws = new FakeAws();
  aws.deployment = deploymentOf(plan.scenario, plan.logicalIds, plan.resourceTypes, routeStates);
  const fixtures = new FakeFixtureStore();
  const out = new FakeOutput();
  let built = 0;
  const factory: AwsFactory = () => {
    built++;
    return aws;
  };
  const run = (options: Partial<CaptureOptions> = {}, prompt = new FakePrompt(true, scenarioId)) =>
    runCapture(
      { scenarioId, account: ACCOUNT, dryRun: false, yes: false, ...options },
      { aws: factory, fixtures, prompt, clock: fixedClock, out },
    );
  return { plan, aws, fixtures, out, run, built: () => built };
}

/** S1 answers as the engine predicts: q1 and q2 reach, q3 is dropped by the web group. */
function s1Answer(request: PathRequest): RawAnalysis {
  if (request.FilterAtSource.DestinationPortRange.FromPort === 22) {
    return {
      Status: 'succeeded',
      NetworkPathFound: false,
      ForwardPathComponents: [{ SequenceNumber: 1, Component: { Id: realId('igw-0000000a') } }],
      Explanations: [
        {
          ExplanationCode: 'ENI_SG_RULES_MISMATCH',
          Component: { Id: realId('eni-0000000a'), Arn: 'arn:aws:ec2:us-east-1:123456789012:x' },
          SecurityGroups: [{ Id: realId('sg-0000000a') }],
        },
      ],
    };
  }
  return { Status: 'succeeded', NetworkPathFound: true };
}

describe('capture (docs/specs/p9-golden.md section 8)', () => {
  it('TRC-06: the dry run prints stages, resources, billable items, analyses and the hash without creating AWS clients', async () => {
    const { run, out, built, plan } = setup('s4-q8-blackhole');
    expect(await run({ dryRun: true, account: undefined })).toBe(0);
    expect(built()).toBe(0);
    expect(out.text).toContain('Stack sim-golden-s4-q8-blackhole · region us-east-1');
    expect(out.text).toContain(`Scenario hash ${plan.hash}`);
    expect(out.text).toContain('Stage 1/3');
    expect(out.text).toContain('Stage 3/3 (final)');
    expect(out.text).toMatch(/AWS::EC2::VPC\s+Vpc0a1b2c3d\s+vpc-0a1b2c3d/);
    expect(out.text).toContain(
      'Billable while deployed: 1 × t3.micro instance, 1 × EBS root volume, 1 × public IPv4 address',
    );
    expect(out.text).toContain('Reachability Analyzer analyses: 2');
    expect(out.text).toContain('Engine expected: BROKE_AT_HOP forward hop 2 MORE_SPECIFIC_ROUTE');
    expect(out.text).toContain('Dry run: no AWS call was made.');
  });

  it('TRC-06: an unknown scenario fails before anything else', async () => {
    const out = new FakeOutput();
    const code = await runCapture(
      { scenarioId: 's9-nope', account: ACCOUNT, dryRun: false, yes: true },
      {
        aws: () => {
          throw new Error('must not build clients');
        },
        fixtures: new FakeFixtureStore(),
        prompt: new FakePrompt(),
        clock: fixedClock,
        out,
      },
    );
    expect(code).toBe(1);
    expect(out.text).toContain('Unknown scenario s9-nope');
  });

  it('TRC-06: an account mismatch stops after the identity check', async () => {
    const { run, aws } = setup('s1-f1-internet-to-web');
    aws.account = '111111111111';
    expect(await run()).toBe(1);
    expect(aws.calls).toEqual(['identity.accountId']);
  });

  it('TRC-06: a region mismatch stops before any billable call', async () => {
    const { run, aws } = setup('s1-f1-internet-to-web');
    aws.regionName = 'eu-west-1';
    expect(await run()).toBe(1);
    expect(aws.calls).toEqual(['identity.accountId', 'identity.region']);
  });

  it('TRC-06: leftovers stop the capture', async () => {
    const { run, aws, out } = setup('s1-f1-internet-to-web');
    aws.taggedPaths = ['nip-00000000000000001'];
    expect(await run()).toBe(1);
    expect(aws.calls).not.toContain('stacks.create sim-golden-s1-f1-internet-to-web');
    expect(out.text).toContain(`pnpm golden:cleanup --account ${ACCOUNT}`);
  });

  it('TRC-06: no confirmation, no deploy', async () => {
    const declined = setup('s1-f1-internet-to-web');
    expect(await declined.run({}, new FakePrompt(true, 'no'))).toBe(1);
    expect(declined.aws.calls.some((call) => call.startsWith('stacks.create'))).toBe(false);

    const unattended = setup('s1-f1-internet-to-web');
    expect(await unattended.run({}, new FakePrompt(false))).toBe(1);
    expect(unattended.aws.calls.some((call) => call.startsWith('stacks.create'))).toBe(false);
  });

  it('TRC-06: a successful capture writes one clean fixture and tears everything down', async () => {
    const { run, aws, fixtures, plan } = setup('s1-f1-internet-to-web');
    aws.answer = s1Answer;
    expect(await run({ yes: true })).toBe(0);

    expect(fixtures.written).toHaveLength(1);
    const written = fixtures.written[0];
    if (written === undefined) throw new Error('fixture written');
    expect(written.json).not.toMatch(/arn:|123456789012|-0f/);
    const fixture = goldenFixtureSchema.parse(JSON.parse(written.json));
    expect(fixture).toMatchObject({
      scenarioId: plan.scenario.id,
      scenarioHash: plan.hash,
      capturedAt: '2026-11-05',
      region: 'us-east-1',
    });
    for (const query of plan.scenario.queries) {
      const analysis = fixture.analyses.find((candidate) => candidate.queryId === query.id);
      if (analysis === undefined) throw new Error(`analysis for ${query.id}`);
      expect(compareAnalysis(trace(plan.scenario.topology, query.query), analysis)).toEqual({
        ok: true,
      });
    }

    expect(aws.tagsSeen[0]).toEqual([
      { key: 'sim:golden', value: 'true' },
      { key: 'sim:scenario', value: 's1-f1-internet-to-web' },
      { key: 'sim:run', value: '2026-11-05T12:00:00.000Z' },
    ]);
    expect(aws.requests[0]).toMatchObject({
      Source: realId('igw-0000000a'),
      Destination: realId('i-0000000a'),
    });
    expect(aws.taggedPaths).toEqual([]);
    expect(aws.taggedAnalyses).toEqual([]);
    expect(aws.stackExists).toBe(false);
    expect(aws.calls.filter((call) => call.startsWith('reachability.deleteAnalysis'))).toHaveLength(
      3,
    );
    expect(aws.calls.filter((call) => call.startsWith('reachability.deletePath'))).toHaveLength(3);
  });

  it('TRC-06: teardown runs when a deploy, an analysis or the normalizer fails', async () => {
    const deployFails = setup('s1-f1-internet-to-web');
    deployFails.aws.failOn.add('stacks.create');
    expect(await deployFails.run({ yes: true })).toBe(1);
    expect(deployFails.aws.calls).toContain('stacks.remove sim-golden-s1-f1-internet-to-web');
    expect(deployFails.fixtures.written).toEqual([]);

    const analysisFails = setup('s1-f1-internet-to-web');
    analysisFails.aws.failOn.add('reachability.waitForAnalysis');
    expect(await analysisFails.run({ yes: true })).toBe(1);
    expect(analysisFails.aws.taggedPaths).toEqual([]);
    expect(analysisFails.aws.taggedAnalyses).toEqual([]);
    expect(analysisFails.aws.stackExists).toBe(false);
    expect(analysisFails.fixtures.written).toEqual([]);

    const leaks = setup('s1-f1-internet-to-web');
    leaks.aws.answer = () => ({
      Status: 'succeeded',
      NetworkPathFound: true,
      ForwardPathComponents: [{ SequenceNumber: 1, Component: { Id: 'vpc-0ffffffffffffffff' } }],
    });
    expect(await leaks.run({ yes: true })).toBe(1);
    expect(leaks.fixtures.written).toEqual([]);
    expect(leaks.fixtures.diagnostics).toHaveLength(1);
    expect(leaks.aws.stackExists).toBe(false);
  });

  it('RT-08: S4 deploys in three stages and stops before any analysis if the route is not blackhole', async () => {
    const good = setup('s4-q8-blackhole');
    expect(await good.run({ yes: true })).toBe(0);
    expect(
      good.aws.calls.filter(
        (call) => call.startsWith('stacks.create') || call.startsWith('stacks.update'),
      ),
    ).toEqual([
      'stacks.create sim-golden-s4-q8-blackhole',
      'stacks.update sim-golden-s4-q8-blackhole',
      'stacks.update sim-golden-s4-q8-blackhole',
    ]);

    const bad = setup('s4-q8-blackhole', { '198.51.100.0/24': 'active' });
    expect(await bad.run({ yes: true })).toBe(1);
    expect(bad.aws.calls.some((call) => call.startsWith('reachability.createPath'))).toBe(false);
    expect(bad.aws.stackExists).toBe(false);
    expect(bad.out.text).toContain(
      'rtb-00000002 198.51.100.0/24: deployed state active, expected blackhole',
    );
  });

  it('TRC-06: analyses and paths are deleted even when the stack delete fails, and the tool exits 2', async () => {
    const { run, aws, out } = setup('s1-f1-internet-to-web');
    aws.failOn.add('stacks.remove');
    expect(await run({ yes: true })).toBe(2);
    expect(aws.taggedPaths).toEqual([]);
    expect(aws.taggedAnalyses).toEqual([]);
    expect(out.text).toContain(`pnpm golden:cleanup --account ${ACCOUNT}`);
  });

  it('TRC-06: an incomplete teardown exits 2 and prints the cleanup command', async () => {
    const { run, aws, out } = setup('s1-f1-internet-to-web');
    aws.failOn.add('reachability.deletePath');
    expect(await run({ yes: true })).toBe(2);
    expect(out.text).toContain(`pnpm golden:cleanup --account ${ACCOUNT}`);
  });

  it('TRC-06: an aborted capture still tears down', async () => {
    const { aws, fixtures, out, plan } = setup('s1-f1-internet-to-web');
    const controller = new AbortController();
    aws.answer = () => {
      controller.abort();
      return { Status: 'succeeded', NetworkPathFound: true };
    };
    const code = await runCapture(
      { scenarioId: plan.scenario.id, account: ACCOUNT, dryRun: false, yes: true },
      {
        aws: () => aws,
        fixtures,
        prompt: new FakePrompt(),
        clock: fixedClock,
        out,
        signal: controller.signal,
      },
    );
    expect(code).toBe(1);
    expect(fixtures.written).toEqual([]);
    expect(aws.stackExists).toBe(false);
    expect(out.text).toContain('Interrupted');
  });
});
