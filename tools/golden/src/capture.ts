import type { FixtureAnalysis } from '@sim/engine/golden';
import {
  GOLDEN_TAG,
  type AwsFactory,
  type Clock,
  type FixtureStore,
  type Output,
  type Prompt,
  type RawAnalysis,
  type Tag,
} from './aws/ports';
import { pathRequest } from './analyses';
import { buildIdMap, routeStateProblems } from './id-map';
import { finalizeFixture, normalizeAnalysis } from './normalize';
import { formatPlan, planCapture, billableLine } from './plan';

/**
 * `pnpm golden:capture <scenario-id>` (docs/specs/p9-golden.md section 8.2): deploy, run the
 * analyses, save the fixture, and always tear down in `finally`. Manual only, costs money.
 * Agents never run it; tests drive it with fakes.
 */

export interface CaptureOptions {
  readonly scenarioId: string;
  readonly account: string | undefined;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export interface CaptureDeps {
  readonly aws: AwsFactory;
  readonly fixtures: FixtureStore;
  readonly prompt: Prompt;
  readonly clock: Clock;
  readonly out: Output;
  readonly signal?: AbortSignal;
}

const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000;

class CaptureStop extends Error {}

const cleanupCommand = (account: string) => `pnpm golden:cleanup --account ${account}`;

export async function runCapture(options: CaptureOptions, deps: CaptureDeps): Promise<number> {
  const { out } = deps;
  const plan = planCapture(options.scenarioId);
  if (!plan.ok) {
    for (const problem of plan.problems) out.line(problem);
    return 1;
  }
  for (const line of formatPlan(plan)) out.line(line);
  if (options.dryRun) {
    out.line('Dry run: no AWS call was made.');
    return 0;
  }
  const account = options.account;
  if (account === undefined) {
    out.line('--account is required for a capture.');
    return 1;
  }

  const aws = deps.aws();
  const callerAccount = await aws.identity.accountId();
  if (callerAccount !== account) {
    out.line(
      `The credentials belong to account ${callerAccount}, not ${account}. Nothing was deployed.`,
    );
    return 1;
  }
  const region = await aws.identity.region();
  if (region !== plan.region) {
    out.line(
      `The SDK region is ${region}, the scenario's is ${plan.region}. Set AWS_REGION=${plan.region}. Nothing was deployed.`,
    );
    return 1;
  }
  const leftovers = await aws.reachability.listTagged();
  if (
    (await aws.stacks.exists(plan.stackName)) ||
    leftovers.paths.length > 0 ||
    leftovers.analyses.length > 0
  ) {
    out.line(`Leftovers from an earlier capture exist. Run ${cleanupCommand(account)} first.`);
    return 1;
  }

  if (!options.yes) {
    if (!deps.prompt.interactive) {
      out.line('Not a terminal: pass --yes to confirm.');
      return 1;
    }
    const confirmed = await deps.prompt.confirm(
      `${billableLine(plan)} and ${String(plan.analyses.length)} Reachability Analyzer analyses. Type ${plan.scenario.id} to deploy`,
      plan.scenario.id,
    );
    if (!confirmed) {
      out.line('Not confirmed. Nothing was deployed.');
      return 1;
    }
  }

  const runId = deps.clock.now().toISOString();
  const tags: Tag[] = [
    GOLDEN_TAG,
    { key: 'sim:scenario', value: plan.scenario.id },
    { key: 'sim:run', value: runId },
  ];
  const created = { stack: false, paths: [] as string[], analyses: [] as string[] };
  const checkAbort = () => {
    if (deps.signal?.aborted === true) throw new CaptureStop('Interrupted.');
  };
  let exitCode = 1;

  try {
    for (const [index, stage] of plan.stages.entries()) {
      checkAbort();
      out.line(
        `Deploying stage ${String(index + 1)}/${String(plan.stages.length)} (${stage.label})…`,
      );
      if (index === 0) {
        created.stack = true;
        await aws.stacks.create(plan.stackName, stage.body, tags);
      } else {
        await aws.stacks.update(plan.stackName, stage.body);
      }
    }

    const resources = await aws.stacks.resources(plan.stackName);
    const vpcIds = resources
      .filter((resource) => resource.type === 'AWS::EC2::VPC')
      .map((resource) => resource.physicalId);
    const snapshot = await aws.inventory.describe(vpcIds);
    const idMap = buildIdMap(plan.scenario, plan.logicalIds, resources, snapshot);
    if (!idMap.ok) throw new CaptureStop(idMap.problems.join('\n'));
    const routeProblems = routeStateProblems(plan.scenario, snapshot, idMap.map);
    if (routeProblems.length > 0)
      throw new CaptureStop(`${routeProblems.join('\n')}\nNo analysis was started.`);

    const realOf = new Map([...idMap.map.ids].map(([real, scenarioId]) => [scenarioId, real]));
    const resolve = (scenarioId: string) => {
      const real = realOf.get(scenarioId);
      if (real === undefined) throw new CaptureStop(`No deployed resource for ${scenarioId}`);
      return real;
    };

    const raws: { queryId: string; raw: RawAnalysis }[] = [];
    for (const query of plan.scenario.queries) {
      checkAbort();
      out.line(`Analyzing ${query.id}…`);
      const pathId = await aws.reachability.createPath(
        pathRequest(plan.scenario, query, resolve),
        tags,
      );
      created.paths.push(pathId);
      const analysisId = await aws.reachability.startAnalysis(pathId, tags);
      created.analyses.push(analysisId);
      raws.push({
        queryId: query.id,
        raw: await aws.reachability.waitForAnalysis(analysisId, ANALYSIS_TIMEOUT_MS),
      });
    }
    checkAbort();

    const analyses: FixtureAnalysis[] = [];
    const problems: string[] = [];
    for (const { queryId, raw } of raws) {
      const result = normalizeAnalysis(queryId, raw, idMap.map);
      if (result.ok) analyses.push(result.analysis);
      else problems.push(...result.problems);
    }
    const fixture =
      problems.length === 0
        ? finalizeFixture(plan.scenario, analyses, runId.slice(0, 10))
        : undefined;
    if (fixture?.ok !== true) {
      const allProblems = [...problems, ...(fixture === undefined ? [] : fixture.problems)];
      const saved = await deps.fixtures.writeDiagnostics(
        `${plan.scenario.id}-${runId.replaceAll(':', '-')}`,
        JSON.stringify({ problems: allProblems, raws }, null, 2),
      );
      throw new CaptureStop(
        `The results can't be saved as a fixture:\n${allProblems.join('\n')}\nRaw responses (real IDs, keep them out of the repository): ${saved}`,
      );
    }
    const path = await deps.fixtures.write(plan.scenario.id, fixture.json);
    out.line(`Fixture saved: ${path}`);
    exitCode = 0;
  } catch (error) {
    out.line(error instanceof Error ? error.message : String(error));
  } finally {
    exitCode = await teardown(plan.stackName, created, aws, out, exitCode, account);
  }
  return exitCode;
}

async function teardown(
  stackName: string,
  created: { stack: boolean; paths: string[]; analyses: string[] },
  aws: ReturnType<AwsFactory>,
  out: Output,
  exitCode: number,
  account: string,
): Promise<number> {
  out.line('Tearing down…');
  const failures: string[] = [];
  const attempt = async (label: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  for (const id of created.analyses)
    await attempt(`delete analysis ${id}`, () => aws.reachability.deleteAnalysis(id));
  for (const id of created.paths)
    await attempt(`delete path ${id}`, () => aws.reachability.deletePath(id));
  if (created.stack) await attempt(`delete stack ${stackName}`, () => aws.stacks.remove(stackName));

  await attempt('check leftovers', async () => {
    const tagged = await aws.reachability.listTagged();
    const remaining = [...tagged.paths, ...tagged.analyses];
    if (await aws.stacks.exists(stackName)) remaining.push(stackName);
    if (remaining.length > 0) throw new Error(`still there: ${remaining.join(', ')}`);
  });

  if (failures.length > 0) {
    for (const failure of failures) out.line(failure);
    out.line(
      `Teardown is incomplete. Run ${cleanupCommand(account)} now: deployed resources keep billing.`,
    );
    return 2;
  }
  out.line('Teardown complete.');
  return exitCode;
}
