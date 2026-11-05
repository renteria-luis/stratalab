import type { Lab } from '@sim/labs';
import { labStore } from '../state/labStore';
import { SANDBOX_WORKSPACE, topologyStore } from '../state/topologyStore';
import { traceStore } from '../state/traceStore';
import { uiStore } from '../state/uiStore';
import { EMPTY_TOPOLOGY } from '../topology/emptyTopology';

/** Opens a lab in its own workspace; a restart puts its initial topology back. */
export function openLab(lab: Lab, restart: boolean) {
  const topology = topologyStore.getState();
  topology.openWorkspace(lab.id, lab.initialTopology);
  if (restart) topologyStore.getState().replaceActiveTopology(lab.initialTopology);
  labStore.getState().openLab(lab.id, restart);
  traceStore.getState().clear();
  uiStore.getState().setVpcFilter(null);
  uiStore.getState().setLabPanelOpen(true);
}

/** Back to the sandbox; the lab's topology and progress stay for later. */
export function leaveLab() {
  topologyStore.getState().openWorkspace(SANDBOX_WORKSPACE, EMPTY_TOPOLOGY);
  labStore.getState().leaveLab();
  traceStore.getState().clear();
  uiStore.getState().setVpcFilter(null);
}
