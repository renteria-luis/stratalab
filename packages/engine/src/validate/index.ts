import type { Topology } from '../schema';
import { checkAddressing } from './addressing';
import { sortIssues, type Issue } from './issue';

/**
 * Static AWS problems in a parsed topology (docs/specs/r0-engine.md section 4).
 * Pure and deterministic: issues come in collection order, then array order, then code order.
 * R0 so far: addressing rules ADR-01 to ADR-04, ADR-09 and ADR-10.
 */
export function validate(topology: Topology): Issue[] {
  return sortIssues(checkAddressing(topology));
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
