import { ViewportPortal } from '@xyflow/react';
import type { Hop } from '@sim/engine';
import { useT } from '../i18n/useT';
import { useTrace } from '../state/traceStore';

/**
 * The moving packet. It subscribes only to the playhead (`currentHopIndex`) and moves with
 * a CSS transform transition, so React renders once per hop and the browser animates the
 * frames (AGENTS.md, 60 FPS rule). Its shape tells the direction: a circle going forward,
 * a diamond on the way back.
 */
export function Packet({
  hops,
  positionOf,
}: {
  hops: readonly Hop[];
  positionOf: (hop: Hop) => { x: number; y: number } | undefined;
}) {
  const { t } = useT();
  const index = useTrace((state) => state.currentHopIndex);
  const hop = hops[index];
  if (hop === undefined) return null;
  const position = positionOf(hop);
  if (position === undefined) return null;
  const failed = hop.outcome === 'fail';
  return (
    <ViewportPortal>
      <div
        className={`sim-packet sim-packet--${hop.direction}${failed ? ' sim-packet--failed' : ''}`}
        style={{ transform: `translate(${String(position.x)}px, ${String(position.y)}px)` }}
        role="img"
        aria-label={t('diagram.packet', { hop: index })}
      />
    </ViewportPortal>
  );
}
