import { useEffect } from 'react';
import { traceStore, useTrace } from '../state/traceStore';

const HOP_INTERVAL_MS = 700;

/**
 * Advances the playhead while a trace plays. It renders nothing and reads the store
 * imperatively, so playback doesn't re-render the diagram (AGENTS.md, 60 FPS rule).
 */
export function TracePlayer() {
  const playing = useTrace((state) => state.playing);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const { result, currentHopIndex, goTo, pause } = traceStore.getState();
      const last = result?.status === 'evaluated' ? result.hops.length - 1 : -1;
      if (currentHopIndex >= last) pause();
      else {
        goTo(currentHopIndex + 1);
        traceStore.setState({ playing: currentHopIndex + 1 < last });
      }
    }, HOP_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [playing]);
  return null;
}
