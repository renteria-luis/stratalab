import type { HelperResult, Topology } from '@sim/engine';

/**
 * Runs `next` on the topology `result` produced, so one console action can chain several
 * helpers (for example "Create security group" inside Launch instance). The first failure
 * stops the chain; the store checks `newErrors` on the final topology only.
 */
export function andThen<A, B>(
  result: HelperResult<A>,
  next: (topology: Topology, created: A) => HelperResult<B>,
): HelperResult<B> {
  return result.ok ? next(result.topology, result.created) : result;
}
