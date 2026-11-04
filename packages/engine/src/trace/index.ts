import { buildModel } from '../model';
import type { Topology } from '../schema';
import { validate } from '../validate';
import { traceF0, traceF1, traceF2 } from './flows';
import { planTrace } from './query';
import type { TraceQuery, TraceResult } from './types';

/**
 * Traces one TCP connection hop by hop in both directions (docs/specs/r0-engine.md
 * section 5). Returns `blocked` without evaluating when the topology has `validate()` errors
 * or the query can't be traced; otherwise the hops, the verdict and the failing hop.
 * Pure and deterministic: the same topology and query always give the same result (TRC-05).
 *
 * Rules: TRC-01 to TRC-05 · .claude/skills/aws-network-rules/references/trace-model.md and
 * https://docs.aws.amazon.com/vpc/latest/reachability/explanation-codes.html
 */
export function trace(topology: Topology, query: TraceQuery): TraceResult {
  const model = buildModel(topology);
  const errors = validate(topology).filter((issue) => issue.severity === 'error');
  const planned = planTrace(model, query);
  if (errors.length > 0 || !planned.ok) {
    return { status: 'blocked', issues: [...errors, ...(planned.ok ? [] : planned.issues)] };
  }
  const { plan } = planned;
  switch (plan.flow) {
    case 'F0':
      return traceF0(model, plan);
    case 'F1':
      return traceF1(model, plan);
    case 'F2':
      return traceF2(model, plan);
  }
}

export {
  QUERY_ISSUE_CODES,
  REASON_CODES,
  type BlockedTrace,
  type Direction,
  type EvaluatedTrace,
  type Hop,
  type HopMatch,
  type HopStep,
  type Packet,
  type QueryIssue,
  type QueryIssueCode,
  type ReasonCode,
  type TraceClient,
  type TraceQuery,
  type TraceResult,
  type Verdict,
} from './types';
