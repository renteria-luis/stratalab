import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { defaultPersistedUi, uiStore } from '../src/state/uiStore';

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  uiStore.setState({ ...defaultPersistedUi('en'), storageProblem: null });
});
