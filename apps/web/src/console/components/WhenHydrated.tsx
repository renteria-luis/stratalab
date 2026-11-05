import Spinner from '@cloudscape-design/components/spinner';
import type { ReactNode } from 'react';
import { useTopologyReady } from '../data';

/**
 * Renders create and edit pages only after the topology store has loaded, so a form opened
 * from a link starts from the saved resource, not from the empty default.
 */
export function WhenHydrated({ children }: { children: ReactNode }) {
  const ready = useTopologyReady();
  return ready ? children : <Spinner size="large" />;
}
