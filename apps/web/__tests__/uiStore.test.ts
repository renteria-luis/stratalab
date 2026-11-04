import { describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createMemoryKeyValue, type KeyValueStore } from '../src/state/keyValue';
import {
  RECENT_LIMIT,
  UI_STORE_KEY,
  UI_STORE_VERSION,
  createUiStore,
  type UiState,
} from '../src/state/uiStore';

async function hydrated(store: StoreApi<UiState>): Promise<UiState> {
  await vi.waitFor(() => {
    expect(store.getState().hydrated).toBe(true);
  });
  return store.getState();
}

const backups = (kv: ReturnType<typeof createMemoryKeyValue>) =>
  [...kv.entries.entries()].filter(([key]) => key.startsWith(`${UI_STORE_KEY}-backup-`));

describe('UI store persistence', () => {
  it('PERSIST: saves and reloads the language, history, favorites and layout', async () => {
    const kv = createMemoryKeyValue();
    const first = createUiStore(kv, 'en');
    await hydrated(first);
    first.getState().setLocale('es');
    first.getState().visitService('macie');
    first.getState().toggleFavorite('vpc');
    first.getState().setHomeLayout([{ id: 'estimated-cost', columnSpan: 4 }]);

    await vi.waitFor(() => {
      expect(kv.entries.get(UI_STORE_KEY)).toMatchObject({ version: UI_STORE_VERSION });
    });
    const second = await hydrated(createUiStore(kv, 'en'));
    expect(second).toMatchObject({
      locale: 'es',
      recentServiceIds: ['macie'],
      favoriteServiceIds: ['vpc'],
      homeLayout: [{ id: 'estimated-cost', columnSpan: 4 }],
      storageProblem: null,
    });
  });

  it.each([
    ['an invalid field', { state: { locale: 'fr' }, version: 1 }],
    [
      'an unknown key',
      {
        state: {
          locale: 'en',
          recentServiceIds: [],
          favoriteServiceIds: [],
          homeLayout: null,
          extra: 1,
        },
        version: 1,
      },
    ],
    [
      'an unknown version',
      {
        state: { locale: 'en', recentServiceIds: [], favoriteServiceIds: [], homeLayout: null },
        version: 99,
      },
    ],
    ['a value that is not an envelope', 'garbage'],
  ])('PERSIST: %s is backed up, the app starts clean and the user is told', async (_name, raw) => {
    const kv = createMemoryKeyValue({ [UI_STORE_KEY]: raw });
    const state = await hydrated(createUiStore(kv, 'en'));
    expect(state.storageProblem).toBe('backed-up');
    expect(state).toMatchObject({ locale: 'en', recentServiceIds: [], favoriteServiceIds: [] });
    expect(backups(kv).map(([, value]) => value)).toEqual([raw]);
  });

  it('PERSIST: a storage that cannot be read starts clean without crashing', async () => {
    const kv: KeyValueStore = {
      get: () => Promise.reject(new Error('blocked')),
      set: () => Promise.resolve(),
    };
    const state = await hydrated(createUiStore(kv, 'es'));
    expect(state.storageProblem).toBe('unreadable');
    expect(state.locale).toBe('es');
  });

  it('PERSIST: a failed save is reported once and does not loop', async () => {
    const set = vi.fn(() => Promise.reject(new Error('quota')));
    const store = createUiStore({ get: () => Promise.resolve(undefined), set }, 'en');
    await hydrated(store);
    store.getState().visitService('s3');
    await vi.waitFor(() => {
      expect(store.getState().storageProblem).toBe('save-failed');
    });
    const calls = set.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(set.mock.calls.length).toBe(calls);
  });
});

describe('UI store actions', () => {
  it('SHELL: recently visited puts the latest first, without duplicates, up to the limit', async () => {
    const store = createUiStore(createMemoryKeyValue(), 'en');
    await hydrated(store);
    for (let i = 0; i < RECENT_LIMIT + 3; i += 1)
      store.getState().visitService(`service-${String(i)}`);
    store.getState().visitService('service-5');
    const recent = store.getState().recentServiceIds;
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0]).toBe('service-5');
    expect(new Set(recent).size).toBe(recent.length);
  });

  it('SHELL: toggling a favorite adds and removes it', async () => {
    const store = createUiStore(createMemoryKeyValue(), 'en');
    await hydrated(store);
    store.getState().toggleFavorite('macie');
    expect(store.getState().favoriteServiceIds).toEqual(['macie']);
    store.getState().toggleFavorite('macie');
    expect(store.getState().favoriteServiceIds).toEqual([]);
  });
});
