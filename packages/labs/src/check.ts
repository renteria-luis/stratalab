import { trace, validate, type Topology, type TraceResult } from '@sim/engine';
import type { Lab } from './schema';

export interface LabQueryResult {
  readonly queryId: string;
  readonly passed: boolean;
  readonly result: TraceResult;
}

export interface LabCheck {
  readonly complete: boolean;
  /** `validate()` errors block every trace, so the lab can't be complete with them. */
  readonly topologyValid: boolean;
  readonly results: readonly LabQueryResult[];
}

/**
 * Checks a learner's topology against a lab's queries. Any valid fix counts: a normal
 * query passes when it is `REACHED`; a `mustStayBlocked` query passes when it is traced
 * and not `REACHED`. Pure and deterministic, like the engine.
 */
export function checkLab(lab: Lab, topology: Topology): LabCheck {
  const topologyValid = validate(topology).every((issue) => issue.severity !== 'error');
  const results = lab.queries.map((query): LabQueryResult => {
    const result = trace(topology, query.query);
    const reached = result.status === 'evaluated' && result.verdict === 'REACHED';
    const passed = query.mustStayBlocked ? result.status === 'evaluated' && !reached : reached;
    return { queryId: query.id, passed, result };
  });
  return {
    complete: topologyValid && results.every((result) => result.passed),
    topologyValid,
    results,
  };
}
