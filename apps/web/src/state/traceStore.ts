import { trace, type Topology, type TraceQuery, type TraceResult } from '@sim/engine';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * The trace on screen and its playhead. Not persisted: a trace is recomputed from the
 * topology. Packet animation reads only `currentHopIndex` (AGENTS.md, 60 FPS rule).
 */
export interface TraceState {
  readonly query: TraceQuery | null;
  readonly result: TraceResult | null;
  /** Hop the packet is at; -1 before the first hop. */
  readonly currentHopIndex: number;
  readonly playing: boolean;
  readonly run: (topology: Topology, query: TraceQuery) => TraceResult;
  /** Sets the query without running it, for example from the virtual browser. */
  readonly prepare: (query: TraceQuery) => void;
  readonly play: () => void;
  readonly pause: () => void;
  readonly goTo: (hopIndex: number) => void;
  readonly clear: () => void;
}

const hopCount = (result: TraceResult | null) =>
  result?.status === 'evaluated' ? result.hops.length : 0;

export const traceStore = createStore<TraceState>()((set, get) => ({
  query: null,
  result: null,
  currentHopIndex: -1,
  playing: false,
  run: (topology, query) => {
    const result = trace(topology, query);
    set({
      query,
      result,
      currentHopIndex: hopCount(result) > 0 ? 0 : -1,
      playing: hopCount(result) > 1,
    });
    return result;
  },
  prepare: (query) => {
    set({ query, result: null, currentHopIndex: -1, playing: false });
  },
  play: () => {
    const { result, currentHopIndex } = get();
    const last = hopCount(result) - 1;
    if (last < 0) return;
    set({ playing: true, currentHopIndex: currentHopIndex >= last ? 0 : currentHopIndex });
  },
  pause: () => {
    set({ playing: false });
  },
  goTo: (hopIndex) => {
    const last = hopCount(get().result) - 1;
    set({ currentHopIndex: Math.max(0, Math.min(hopIndex, last)), playing: false });
  },
  clear: () => {
    set({ query: null, result: null, currentHopIndex: -1, playing: false });
  },
}));

export function useTrace<T>(selector: (state: TraceState) => T): T {
  return useStore(traceStore, selector);
}
