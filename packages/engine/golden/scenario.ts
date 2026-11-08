import { z } from 'zod';
import { REASON_CODES, topologySchema, trace, validate, type TraceResult } from '../src/index';
import type { ClientType } from '../src/model';
import { ipv4Schema } from '../src/schema/primitives';
import { canonicalJson } from './canonical-json';

/**
 * A golden scenario: one engine topology plus the queries to analyze with Reachability
 * Analyzer, one analysis per query (TRC-06, docs/specs/p9-golden.md section 2).
 */

const CLIENT_TYPES = [
  'linux',
  'windows',
  'nat-gateway',
  'elb',
  'lambda',
  'custom',
] as const satisfies readonly ClientType[];

const port = z.number().int().min(1).max(65535);

/** A trace query with the client port always explicit, so the analysis filter and the hash use it. */
export const goldenTraceQuerySchema = z.strictObject({
  protocol: z.literal('tcp'),
  source: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('internet'), ipAddress: ipv4Schema }),
    z.strictObject({ type: z.literal('instance'), instanceId: z.string() }),
  ]),
  destination: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('internet'), ipAddress: ipv4Schema }),
    z.strictObject({
      type: z.literal('instance'),
      instanceId: z.string(),
      address: z.enum(['public', 'private']),
    }),
  ]),
  destinationPort: port,
  clientType: z.enum(CLIENT_TYPES),
  sourcePort: port,
});

export const goldenExpectedSchema = z.union([
  z.strictObject({ verdict: z.literal('REACHED') }),
  z.strictObject({
    verdict: z.enum(['BROKE_AT_HOP', 'ROUTED_THEN_DROPPED']),
    direction: z.enum(['forward', 'return']),
    hopIndex: z.number().int().min(0),
    reasonCodes: z.array(z.enum(REASON_CODES)).min(1),
  }),
]);

export const goldenQuerySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  label: z.string().min(1),
  /** Test name prefix (AGENTS.md, Testing). */
  ruleIds: z.array(z.string().regex(/^[A-Z]+-[0-9A-Z]+$/)).min(1),
  /** `reply`: the other direction of a request, sent as its own analysis (TRC-06). */
  leg: z.enum(['request', 'reply']),
  query: goldenTraceQuerySchema,
  /** The engine's current result. The fixture, not this, is the oracle. */
  expected: goldenExpectedSchema,
});

export const goldenScenarioSchema = z
  .strictObject({
    /** Also the fixture file name and the stack name suffix. */
    id: z.string().regex(/^s[0-9]+-[a-z0-9-]{1,60}$/),
    title: z.string().min(1),
    topology: topologySchema,
    queries: z.array(goldenQuerySchema).min(1),
  })
  .refine(
    (scenario) =>
      new Set(scenario.queries.map((query) => query.id)).size === scenario.queries.length,
    {
      message: 'Query IDs must be unique',
      path: ['queries'],
    },
  );

export type GoldenScenario = z.output<typeof goldenScenarioSchema>;
export type GoldenScenarioInput = z.input<typeof goldenScenarioSchema>;
export type GoldenQuery = GoldenScenario['queries'][number];
export type GoldenExpected = z.output<typeof goldenExpectedSchema>;

/** The engine result in the shape scenarios declare it, or the blocking codes. */
export function summarizeTrace(result: TraceResult): GoldenExpected | { blocked: string[] } {
  if (result.status === 'blocked') return { blocked: result.issues.map((issue) => issue.code) };
  if (result.failure === undefined) return { verdict: 'REACHED' };
  return {
    verdict: result.verdict === 'BROKE_AT_HOP' ? 'BROKE_AT_HOP' : 'ROUTED_THEN_DROPPED',
    direction: result.failure.direction,
    hopIndex: result.failure.hopIndex,
    reasonCodes: [...result.failure.reasonCodes],
  };
}

/** Our own codes have no Reachability Analyzer counterpart (TRC-06). */
const UNCONFIRMABLE = ['NO_LISTENER', 'NO_INTERNET_GATEWAY'] as const;

/**
 * Self-checks for a parsed scenario (docs/specs/p9-golden.md section 2.1). Returns problems
 * as plain English lines; an empty list means the scenario can be captured.
 */
export function checkScenario(scenario: GoldenScenario): string[] {
  const problems: string[] = [];
  const { topology } = scenario;

  for (const issue of validate(topology)) {
    if (issue.severity === 'error') problems.push(`topology: validate() error ${issue.code}`);
  }
  for (const instance of topology.instances) {
    if (instance.platform !== 'linux')
      problems.push(`${instance.id}: only linux instances can be deployed`);
    if (instance.primaryNetworkInterface.publicIp?.kind === 'elastic-ip') {
      problems.push(`${instance.id}: only auto-assigned public IPv4 addresses can be deployed`);
    }
  }

  for (const query of scenario.queries) {
    const { source, destination } = query.query;
    const inbound =
      source.type === 'internet' &&
      destination.type === 'instance' &&
      destination.address === 'public';
    const outbound = source.type === 'instance' && destination.type === 'internet';
    if (!inbound && !outbound) {
      problems.push(
        `${query.id}: unsupported query shape (only internet → instance public and instance → internet)`,
      );
    }

    const summary = summarizeTrace(trace(topology, query.query));
    if ('blocked' in summary) {
      problems.push(`${query.id}: the trace is blocked (${summary.blocked.join(', ')})`);
      continue;
    }
    if (summary.verdict !== 'REACHED') {
      for (const code of UNCONFIRMABLE) {
        if (summary.reasonCodes.includes(code)) {
          problems.push(
            `${query.id}: the engine result uses ${code}, which no analysis can confirm`,
          );
        }
      }
    }
    if (canonicalJson(summary) !== canonicalJson(query.expected)) {
      problems.push(
        `${query.id}: engine gives ${JSON.stringify(summary)}, expected ${JSON.stringify(query.expected)}`,
      );
    }
  }
  return problems;
}
