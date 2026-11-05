import type { HelperError, Issue } from '@sim/engine';
import type { ChangeOutcome } from '../../state/topologyStore';

export type ChangeFailure = { readonly error: HelperError } | { readonly issues: readonly Issue[] };

/** The failure of a console change, or null. */
export function failureOf<T>(outcome: ChangeOutcome<T>): ChangeFailure | null {
  if (outcome.ok) return null;
  return 'error' in outcome ? { error: outcome.error } : { issues: outcome.issues };
}
