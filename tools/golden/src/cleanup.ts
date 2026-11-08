import { GOLDEN_SCENARIOS } from '@sim/engine/golden';
import {
  GOLDEN_TAG,
  type AwsFactory,
  type Output,
  type Prompt,
  type TaggedKind,
  type TaggedResource,
} from './aws/ports';

/**
 * `pnpm golden:cleanup` (docs/specs/p9-golden.md section 8.3): finds leftovers tagged
 * `sim:golden=true` and deletes them in dependency order. It never touches anything without
 * that tag. Manual only; agents never run it.
 */

export interface CleanupOptions {
  readonly account: string;
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export interface CleanupDeps {
  readonly aws: AwsFactory;
  readonly prompt: Prompt;
  readonly out: Output;
}

const DELETE_ORDER: readonly TaggedKind[] = [
  'instance',
  'internet-gateway',
  'subnet',
  'route-table',
  'network-acl',
  'security-group',
  'vpc',
];

const isGolden = (resource: TaggedResource) =>
  resource.tags.some((tag) => tag.key === GOLDEN_TAG.key && tag.value === GOLDEN_TAG.value);

export async function runCleanup(options: CleanupOptions, deps: CleanupDeps): Promise<number> {
  const { out } = deps;
  const aws = deps.aws();
  const callerAccount = await aws.identity.accountId();
  if (callerAccount !== options.account) {
    out.line(
      `The credentials belong to account ${callerAccount}, not ${options.account}. Nothing was deleted.`,
    );
    return 1;
  }
  const region = await aws.identity.region();
  const regions = new Set(GOLDEN_SCENARIOS.map((scenario) => scenario.topology.region));
  if (!regions.has(region)) {
    out.line(
      `The SDK region is ${region}; golden scenarios use ${[...regions].join(', ')}. Nothing was deleted.`,
    );
    return 1;
  }

  const found = async () => {
    const reachability = await aws.reachability.listTagged();
    const stacks = await aws.stacks.listGolden();
    const resources = (await aws.inventory.listTagged()).filter(isGolden);
    return { ...reachability, stacks, resources };
  };
  const before = await found();
  const total =
    before.analyses.length + before.paths.length + before.stacks.length + before.resources.length;
  if (total === 0) {
    out.line('Nothing to clean up.');
    return 0;
  }
  out.line('Tagged sim:golden=true:');
  for (const id of before.analyses) out.line(`  analysis ${id}`);
  for (const id of before.paths) out.line(`  path ${id}`);
  for (const name of before.stacks) out.line(`  stack ${name}`);
  for (const resource of before.resources) out.line(`  ${resource.kind} ${resource.id}`);
  if (options.dryRun) {
    out.line('Dry run: nothing was deleted.');
    return 0;
  }
  if (!options.yes) {
    if (!deps.prompt.interactive) {
      out.line('Not a terminal: pass --yes to confirm.');
      return 1;
    }
    if (
      !(await deps.prompt.confirm(`Delete these ${String(total)} items? Type delete`, 'delete'))
    ) {
      out.line('Not confirmed. Nothing was deleted.');
      return 1;
    }
  }

  const failures: string[] = [];
  const attempt = async (label: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  for (const id of before.analyses)
    await attempt(`analysis ${id}`, () => aws.reachability.deleteAnalysis(id));
  for (const id of before.paths) await attempt(`path ${id}`, () => aws.reachability.deletePath(id));
  for (const name of before.stacks) await attempt(`stack ${name}`, () => aws.stacks.remove(name));

  // What a failed stack delete left behind, in dependency order.
  const orphans = (await aws.inventory.listTagged()).filter(isGolden);
  for (const kind of DELETE_ORDER) {
    for (const resource of orphans.filter((item) => item.kind === kind)) {
      await attempt(`${resource.kind} ${resource.id}`, () => aws.inventory.remove(resource));
    }
  }
  for (const name of before.stacks) {
    if (await aws.stacks.exists(name))
      await attempt(`stack ${name} (retry)`, () => aws.stacks.remove(name));
  }

  const after = await found();
  const left =
    after.analyses.length + after.paths.length + after.stacks.length + after.resources.length;
  for (const failure of failures) out.line(failure);
  if (left > 0) {
    out.line(
      `${String(left)} items are still tagged sim:golden=true. Check the console and run cleanup again.`,
    );
    return 2;
  }
  out.line('Cleanup complete.');
  return failures.length > 0 ? 2 : 0;
}
