import { useState } from 'react';
import { useLocation } from 'react-router';

/** Router state a create page passes back so the list opens with the new resource selected. */
export interface SelectState {
  readonly selectId?: string;
}

/** Table selection, starting with the resource a create page just made. */
export function useSelection(): [string[], (ids: string[]) => void] {
  const location = useLocation();
  const state = location.state as SelectState | null;
  const [selected, setSelected] = useState<string[]>(
    state?.selectId === undefined ? [] : [state.selectId],
  );
  return [selected, setSelected];
}

/** The one selected ID, or null when zero or several are selected. */
export function single(ids: readonly string[]): string | null {
  return ids.length === 1 ? (ids[0] ?? null) : null;
}
