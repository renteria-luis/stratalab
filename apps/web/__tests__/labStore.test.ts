import { describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createMemoryKeyValue } from '../src/state/keyValue';
import { LAB_STORE_KEY, createLabStore, isUnder, type LabState } from '../src/state/labStore';
import { UI_STORE_KEY, UI_STORE_VERSION, createUiStore } from '../src/state/uiStore';

async function hydrated<S extends { hydrated: boolean }>(store: StoreApi<S>): Promise<S> {
  await vi.waitFor(() => {
    expect(store.getState().hydrated).toBe(true);
  });
  return store.getState();
}

const RELEVANT = ['/labs', '/vpc/route-tables', '/vpc/security-groups'];

describe('lab progress', () => {
  it('LAB: wrong turns are pages outside the solution path, recorded once', async () => {
    const store: StoreApi<LabState> = createLabStore(createMemoryKeyValue());
    await hydrated(store);
    store.getState().openLab('lab-01', false);
    for (const path of [
      '/',
      '/vpc/route-tables/rtb-1/edit-routes',
      '/reference/macie',
      '/reference/macie',
      '/s3',
    ]) {
      store.getState().recordVisit(path, RELEVANT);
    }
    expect(store.getState().progress['lab-01']?.wrongTurns).toEqual(['/reference/macie', '/s3']);
  });

  it('LAB: hints and traces are counted; restart clears them; completion stops wrong turns', async () => {
    const store = createLabStore(createMemoryKeyValue());
    await hydrated(store);
    store.getState().openLab('lab-01', false);
    store.getState().takeHint('lab-01');
    store.getState().recordTrace();
    expect(store.getState().progress['lab-01']).toMatchObject({ hintsUsed: 1, tracesRun: 1 });
    store.getState().completeLab('lab-01');
    store.getState().recordVisit('/s3', RELEVANT);
    expect(store.getState().progress['lab-01']).toMatchObject({
      status: 'completed',
      wrongTurns: [],
    });
    store.getState().openLab('lab-01', true);
    expect(store.getState().progress['lab-01']).toEqual({
      status: 'in-progress',
      hintsUsed: 0,
      tracesRun: 0,
      wrongTurns: [],
    });
  });

  it('PERSIST: invalid lab progress is backed up and starts clean', async () => {
    const kv = createMemoryKeyValue({
      [LAB_STORE_KEY]: { state: { activeLabId: 'not-a-lab', progress: {} }, version: 1 },
    });
    const state = await hydrated(createLabStore(kv));
    expect(state.storageProblem).toBe('backed-up');
    expect(state.activeLabId).toBeNull();
  });

  it('LAB: isUnder matches a prefix and the pages below it only', () => {
    expect(isUnder('/vpc/route-tables', RELEVANT)).toBe(true);
    expect(isUnder('/vpc/route-tables/x', RELEVANT)).toBe(true);
    expect(isUnder('/vpc/route-tablesx', RELEVANT)).toBe(false);
  });
});

describe('UI store version 2', () => {
  it('PERSIST: version 1 data migrates to version 2 with empty canvas layouts', async () => {
    const kv = createMemoryKeyValue({
      [UI_STORE_KEY]: {
        state: {
          locale: 'es',
          recentServiceIds: ['vpc'],
          favoriteServiceIds: [],
          homeLayout: null,
        },
        version: 1,
      },
    });
    const state = await hydrated(createUiStore(kv, 'en'));
    expect(UI_STORE_VERSION).toBe(2);
    expect(state).toMatchObject({
      locale: 'es',
      recentServiceIds: ['vpc'],
      canvasLayouts: {},
      storageProblem: null,
    });
  });

  it('PERSIST: moved canvas nodes are saved per workspace', async () => {
    const kv = createMemoryKeyValue();
    const store = createUiStore(kv, 'en');
    await hydrated(store);
    store.getState().moveCanvasNode('lab-01', 'i-0000000a', 1, 2);
    await vi.waitFor(() => {
      expect(kv.entries.get(UI_STORE_KEY)).toMatchObject({
        state: { canvasLayouts: { 'lab-01': { 'i-0000000a': { x: 1, y: 2 } } } },
      });
    });
  });
});
