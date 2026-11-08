import {
  checkScenario,
  findScenario,
  scenarioHash,
  type GoldenExpected,
  type GoldenScenario,
} from '@sim/engine/golden';
import type { PathRequest } from './aws/ports';
import { pathRequest } from './analyses';
import { planStages } from './cdk/stages';
import { INSTANCE_TYPE, synthesize, translationErrors } from './cdk/translate';

/**
 * Everything a capture will do, computed without credentials (docs/specs/p9-golden.md
 * section 8.1). The dry run prints it; a real capture deploys it.
 */

/** CloudFormation's limit for `TemplateBody`; larger templates need S3, which we don't use. */
const TEMPLATE_BODY_LIMIT = 51_200;

export interface PlannedStage {
  readonly label: string;
  readonly body: string;
  readonly resources: readonly {
    readonly type: string;
    readonly logicalId: string;
    readonly topologyId: string;
  }[];
}

export interface PlannedAnalysis {
  readonly queryId: string;
  readonly label: string;
  /** With scenario IDs; the capture resolves them to real IDs. */
  readonly request: PathRequest;
  readonly expected: GoldenExpected;
}

export interface CapturePlan {
  readonly ok: true;
  readonly scenario: GoldenScenario;
  readonly hash: string;
  readonly stackName: string;
  readonly region: string;
  readonly stages: readonly PlannedStage[];
  /** Logical ID → topology ID, over every stage. */
  readonly logicalIds: ReadonlyMap<string, string>;
  /** Logical ID → CloudFormation type, over every stage. */
  readonly resourceTypes: ReadonlyMap<string, string>;
  readonly analyses: readonly PlannedAnalysis[];
  readonly billable: {
    readonly instances: number;
    readonly ebsVolumes: number;
    readonly publicIpv4: number;
  };
}

export type PlanResult = CapturePlan | { readonly ok: false; readonly problems: string[] };

export const stackNameOf = (scenarioId: string) => `sim-golden-${scenarioId}`;

export function planCapture(scenarioId: string): PlanResult {
  const scenario = findScenario(scenarioId);
  if (scenario === undefined) return { ok: false, problems: [`Unknown scenario ${scenarioId}`] };

  const problems = [
    ...checkScenario(scenario),
    ...translationErrors(scenario.topology).map((error) => `${error.code}: ${error.message}`),
  ];
  const stagePlan = planStages(scenario.topology);
  if (!stagePlan.ok)
    problems.push(...stagePlan.errors.map((error) => `${error.code}: ${error.message}`));
  if (problems.length > 0 || !stagePlan.ok) return { ok: false, problems };

  const stackName = stackNameOf(scenario.id);
  const logicalIds = new Map<string, string>();
  const resourceTypes = new Map<string, string>();
  const stages: PlannedStage[] = [];
  for (const stage of stagePlan.stages) {
    const synthesized = synthesize(stackName, stage.topology);
    if (synthesized.body.length > TEMPLATE_BODY_LIMIT) {
      return {
        ok: false,
        problems: [`GOLDEN_TEMPLATE_TOO_LARGE: stage "${stage.label}" needs S3`],
      };
    }
    for (const [logicalId, topologyId] of synthesized.logicalIds)
      logicalIds.set(logicalId, topologyId);
    for (const [logicalId, type] of synthesized.types) resourceTypes.set(logicalId, type);
    stages.push({
      label: stage.label,
      body: synthesized.body,
      resources: [...synthesized.types].map(([logicalId, type]) => ({
        type,
        logicalId,
        topologyId: synthesized.logicalIds.get(logicalId) ?? '',
      })),
    });
  }

  let analyses: PlannedAnalysis[];
  try {
    analyses = scenario.queries.map((query) => ({
      queryId: query.id,
      label: query.label,
      request: pathRequest(scenario, query, (id) => id),
      expected: query.expected,
    }));
  } catch (error) {
    return { ok: false, problems: [error instanceof Error ? error.message : String(error)] };
  }

  const instances = scenario.topology.instances;
  return {
    ok: true,
    scenario,
    hash: scenarioHash(scenario),
    stackName,
    region: scenario.topology.region,
    stages,
    logicalIds,
    resourceTypes,
    analyses,
    billable: {
      instances: instances.length,
      ebsVolumes: instances.length,
      publicIpv4: instances.filter(
        (instance) => instance.primaryNetworkInterface.publicIp !== undefined,
      ).length,
    },
  };
}

function describeExpected(expected: GoldenExpected): string {
  if (expected.verdict === 'REACHED') return 'REACHED';
  return `${expected.verdict} ${expected.direction} hop ${String(expected.hopIndex)} ${expected.reasonCodes.join(', ')}`;
}

export function billableLine(plan: CapturePlan): string {
  const { instances, ebsVolumes, publicIpv4 } = plan.billable;
  return `Billable while deployed: ${String(instances)} × ${INSTANCE_TYPE} instance, ${String(ebsVolumes)} × EBS root volume, ${String(publicIpv4)} × public IPv4 address`;
}

/** The dry-run report (also printed before a real capture asks for confirmation). */
export function formatPlan(plan: CapturePlan): string[] {
  const lines = [
    `Scenario ${plan.scenario.id}: ${plan.scenario.title}`,
    `Scenario hash ${plan.hash}`,
    `Stack ${plan.stackName} · region ${plan.region}`,
  ];
  plan.stages.forEach((stage, index) => {
    lines.push(`Stage ${String(index + 1)}/${String(plan.stages.length)} (${stage.label})`);
    const width = Math.max(...stage.resources.map((resource) => resource.type.length));
    const idWidth = Math.max(...stage.resources.map((resource) => resource.logicalId.length));
    for (const resource of stage.resources) {
      lines.push(
        `  ${resource.type.padEnd(width)}  ${resource.logicalId.padEnd(idWidth)}  ${resource.topologyId}`,
      );
    }
  });
  lines.push(billableLine(plan));
  lines.push(`Reachability Analyzer analyses: ${String(plan.analyses.length)}`);
  for (const analysis of plan.analyses) {
    lines.push(`  ${analysis.queryId}: ${analysis.label}`);
    lines.push(`    CreateNetworkInsightsPath ${JSON.stringify(analysis.request)}`);
    lines.push(`    Engine expected: ${describeExpected(analysis.expected)}`);
  }
  return lines;
}
