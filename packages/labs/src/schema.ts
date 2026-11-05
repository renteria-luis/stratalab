import { REASON_CODES, topologySchema } from '@sim/engine';
import { z } from 'zod';

/**
 * Lab data model. Texts are simulator text, so every one has `en` and `es` (AGENTS.md,
 * "Language"). Each query declares its expected result on both the initial and the
 * solution topology (AGENTS.md, Testing); `mustStayBlocked` marks a guard query that the
 * lab requires to stay blocked.
 */

export const localizedTextSchema = z.strictObject({
  en: z.string().min(1),
  es: z.string().min(1),
});

const failedVerdictSchema = z.strictObject({
  verdict: z.enum(['BROKE_AT_HOP', 'ROUTED_THEN_DROPPED']),
  direction: z.enum(['forward', 'return']),
  hopIndex: z.number().int().min(0),
  reasonCodes: z.array(z.enum(REASON_CODES)).min(1),
});

export const expectedResultSchema = z.union([
  z.strictObject({ verdict: z.literal('REACHED') }),
  failedVerdictSchema,
]);

const ipv4 = z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/);

/** Mirror of the engine's `TraceQuery` (docs/specs/r0-engine.md section 5.1). */
export const traceQuerySchema = z.strictObject({
  protocol: z.literal('tcp'),
  source: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('internet'), ipAddress: ipv4 }),
    z.strictObject({ type: z.literal('instance'), instanceId: z.string() }),
  ]),
  destination: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('internet'), ipAddress: ipv4 }),
    z.strictObject({
      type: z.literal('instance'),
      instanceId: z.string(),
      address: z.enum(['public', 'private']),
    }),
  ]),
  destinationPort: z.number().int().min(1).max(65535),
});

export const labQuerySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: localizedTextSchema,
  query: traceQuerySchema,
  /** The lab is done only while this query stays blocked (a security requirement). */
  mustStayBlocked: z.boolean(),
  expected: z.strictObject({ initial: expectedResultSchema, solution: expectedResultSchema }),
});

export const labSchema = z.strictObject({
  /** Also the topology workspace ID (`lab-<id>`). */
  id: z.string().regex(/^lab-[a-z0-9-]{1,64}$/),
  version: z.number().int().min(1),
  title: localizedTextSchema,
  summary: localizedTextSchema,
  story: localizedTextSchema,
  goal: localizedTextSchema,
  /** Opt-in, in order from gentle to direct. */
  hints: z.array(localizedTextSchema).min(1),
  initialTopology: topologySchema,
  solutionTopology: topologySchema,
  queries: z.array(labQuerySchema).min(1),
  /** Console paths on the solution path (prefixes). Visits elsewhere are wrong turns. */
  relevantRoutes: z.array(z.string().startsWith('/')).min(1),
  /** The address the story gives the learner for the virtual browser. */
  browserUrl: z.url(),
});

export type LocalizedText = z.output<typeof localizedTextSchema>;
export type ExpectedResult = z.output<typeof expectedResultSchema>;
export type LabQuery = z.output<typeof labQuerySchema>;
export type Lab = z.output<typeof labSchema>;
