import { buildModel } from '../model';
import type { Topology } from '../schema';
import { checkAddressing } from './addressing';
import { checkFiltering } from './filtering';
import { sortIssues, type Issue } from './issue';
import { checkQuotas } from './quotas';
import { checkReferences } from './references';
import { checkRouting } from './routing';

/**
 * Static AWS problems in a parsed topology (docs/specs/r0-engine.md section 4).
 * Pure and deterministic: issues come in collection order, then array order, then code order.
 * Errors block `trace()`; warnings (`QUOTA_EXCEEDED`) don't.
 */
export function validate(topology: Topology): Issue[] {
  const model = buildModel(topology);
  return sortIssues([
    ...checkAddressing(topology),
    ...checkReferences(model),
    ...checkRouting(model),
    ...checkFiltering(topology),
    ...checkQuotas(topology),
  ]);
}

export {
  ISSUE_CODES,
  TOPOLOGY_COLLECTIONS,
  type Issue,
  type IssueCode,
  type ResourceRef,
  type ResourceType,
  type TopologyCollection,
} from './issue';
