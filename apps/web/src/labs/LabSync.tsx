import { useEffect } from 'react';
import { useLabs } from '../state/labStore';
import { SANDBOX_WORKSPACE, topologyStore, useTopologyStore } from '../state/topologyStore';
import { EMPTY_TOPOLOGY } from '../topology/emptyTopology';
import { labById } from './useActiveLab';

/**
 * Keeps the topology workspace in step with the open lab after both stores load (they
 * persist separately, so a failed save of one can leave them apart).
 */
export function LabSync() {
  const labsReady = useLabs((state) => state.hydrated);
  const topologyReady = useTopologyStore((state) => state.hydrated);
  const activeLabId = useLabs((state) => state.activeLabId);
  const workspaceId = useTopologyStore((state) => state.activeWorkspaceId);

  useEffect(() => {
    if (!labsReady || !topologyReady) return;
    const lab = labById(activeLabId);
    const wanted = lab?.id ?? SANDBOX_WORKSPACE;
    if (workspaceId === wanted) return;
    topologyStore.getState().openWorkspace(wanted, lab?.initialTopology ?? EMPTY_TOPOLOGY);
  }, [labsReady, topologyReady, activeLabId, workspaceId]);
  return null;
}
