import type { HelperResult, Topology } from '@sim/engine';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { applyChange } from '../data';
import { failureOf, type ChangeFailure } from './failure';
import type { SelectState } from './useSelection';

/**
 * Submits one console change and, when it succeeds, goes back to the list with the
 * resource selected. On failure the page shows why.
 */
export function useChange(): {
  failure: ChangeFailure | null;
  submit: <T>(
    change: (topology: Topology) => HelperResult<T>,
    next: (created: T) => { href: string; selectId?: string },
  ) => boolean;
} {
  const navigate = useNavigate();
  const [failure, setFailure] = useState<ChangeFailure | null>(null);
  return {
    failure,
    submit: (change, next) => {
      const outcome = applyChange(change);
      setFailure(failureOf(outcome));
      if (!outcome.ok) return false;
      const { href, selectId } = next(outcome.created);
      void navigate(href, { state: { selectId } satisfies SelectState });
      return true;
    },
  };
}
