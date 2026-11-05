import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { defaultPersistedLabs, labStore } from '../src/state/labStore';
import { defaultPersistedTopology, topologyStore } from '../src/state/topologyStore';
import { traceStore } from '../src/state/traceStore';
import { defaultPersistedUi, uiStore } from '../src/state/uiStore';

// jsdom has no ResizeObserver; the split panel and React Flow observe sizes.
class ResizeObserverStub {
  observe() {
    // No layout in jsdom.
  }
  unobserve() {
    // No layout in jsdom.
  }
  disconnect() {
    // No layout in jsdom.
  }
}
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub;
}

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  uiStore.setState({ ...defaultPersistedUi('en'), storageProblem: null, vpcFilter: null });
  topologyStore.setState({ ...defaultPersistedTopology(), storageProblem: null });
  labStore.setState({ ...defaultPersistedLabs(), storageProblem: null });
  traceStore.getState().clear();
  uiStore.setState({ workbenchOpen: false, workbenchTab: 'diagram', labPanelOpen: true });
});
