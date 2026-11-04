import { z } from 'zod';
import { useStore } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { LOCALES, detectLocale, type Locale } from '../i18n/locales';
import { createIdbKeyValue, createMemoryKeyValue, type KeyValueStore } from './keyValue';

/**
 * UI store: language, recently visited services, favorites and the Console Home layout.
 * It holds no topology data (AGENTS.md, architecture rule 5).
 *
 * Persistence follows architecture rule 7: IndexedDB through `persist`, a `version` with a
 * migration step, and Zod validation on load. Data that fails validation is copied to a
 * backup key before the app starts clean, and the shell tells the user. Loading never throws.
 */

export const UI_STORE_KEY = 'sim-ui';
export const UI_STORE_VERSION = 1;
export const RECENT_LIMIT = 10;

const serviceIdList = (max: number) => z.array(z.string().min(1).max(100)).max(max);

export const homeLayoutItemSchema = z.strictObject({
  id: z.string().min(1).max(64),
  columnSpan: z.number().int().min(1).max(12).optional(),
  rowSpan: z.number().int().min(1).max(50).optional(),
  columnOffset: z.record(z.string(), z.number().int().min(0).max(12)).optional(),
});

export const persistedUiSchema = z.strictObject({
  locale: z.enum(LOCALES),
  recentServiceIds: serviceIdList(RECENT_LIMIT),
  favoriteServiceIds: serviceIdList(1000),
  homeLayout: z.array(homeLayoutItemSchema).max(20).nullable(),
});

export type PersistedUi = z.output<typeof persistedUiSchema>;
export type HomeLayoutItem = z.output<typeof homeLayoutItemSchema>;

const envelopeSchema = z.object({ state: z.unknown(), version: z.number().int() });

/** What went wrong with browser storage, shown once by the shell. */
export type StorageProblem = 'backed-up' | 'unreadable' | 'save-failed';

export interface UiState extends PersistedUi {
  readonly hydrated: boolean;
  readonly storageProblem: StorageProblem | null;
  readonly setLocale: (locale: Locale) => void;
  readonly visitService: (serviceId: string) => void;
  readonly toggleFavorite: (serviceId: string) => void;
  readonly setHomeLayout: (layout: readonly HomeLayoutItem[]) => void;
  readonly dismissStorageProblem: () => void;
}

/**
 * Brings stored state from `fromVersion` to the current version. Version 1 is the first
 * one, so there is nothing to convert yet; an unknown version gives `undefined`, which
 * fails validation and is backed up.
 */
export function migrateUiState(state: unknown, fromVersion: number): unknown {
  return fromVersion === UI_STORE_VERSION ? state : undefined;
}

export function defaultPersistedUi(locale: Locale): PersistedUi {
  return { locale, recentServiceIds: [], favoriteServiceIds: [], homeLayout: null };
}

export function backupKey(date: Date): string {
  return `${UI_STORE_KEY}-backup-${date.toISOString()}`;
}

interface LoadResult {
  readonly value: StorageValue<PersistedUi> | null;
  readonly problem: StorageProblem | null;
}

async function load(kv: KeyValueStore, name: string): Promise<LoadResult> {
  let raw: unknown;
  try {
    raw = await kv.get(name);
  } catch {
    return { value: null, problem: 'unreadable' };
  }
  if (raw === undefined) return { value: null, problem: null };

  const envelope = envelopeSchema.safeParse(raw);
  const parsed = envelope.success
    ? persistedUiSchema.safeParse(migrateUiState(envelope.data.state, envelope.data.version))
    : undefined;
  if (parsed?.success) {
    return { value: { state: parsed.data, version: UI_STORE_VERSION }, problem: null };
  }

  try {
    await kv.set(backupKey(new Date()), raw);
    return { value: null, problem: 'backed-up' };
  } catch {
    return { value: null, problem: 'unreadable' };
  }
}

export function createUiStore(kv: KeyValueStore, initialLocale: Locale): StoreApi<UiState> {
  let loadProblem: StorageProblem | null = null;

  const storage: PersistStorage<PersistedUi, Promise<void>> = {
    getItem: async (name) => {
      const result = await load(kv, name);
      loadProblem = result.problem;
      return result.value;
    },
    setItem: async (name, value) => {
      try {
        await kv.set(name, value);
      } catch {
        // Guarded so a storage that keeps failing cannot loop through setState -> setItem.
        if (store.getState().storageProblem !== 'save-failed') {
          store.setState({ storageProblem: 'save-failed' });
        }
      }
    },
    removeItem: () => Promise.resolve(),
  };

  const store = createStore<UiState>()(
    persist(
      (set) => ({
        ...defaultPersistedUi(initialLocale),
        hydrated: false,
        storageProblem: null,
        setLocale: (locale) => {
          set({ locale });
        },
        visitService: (serviceId) => {
          set((state) => ({
            recentServiceIds: [
              serviceId,
              ...state.recentServiceIds.filter((id) => id !== serviceId),
            ].slice(0, RECENT_LIMIT),
          }));
        },
        toggleFavorite: (serviceId) => {
          set((state) => ({
            favoriteServiceIds: state.favoriteServiceIds.includes(serviceId)
              ? state.favoriteServiceIds.filter((id) => id !== serviceId)
              : [...state.favoriteServiceIds, serviceId],
          }));
        },
        setHomeLayout: (layout) => {
          set({ homeLayout: [...layout] });
        },
        dismissStorageProblem: () => {
          set({ storageProblem: null });
        },
      }),
      {
        name: UI_STORE_KEY,
        version: UI_STORE_VERSION,
        storage,
        partialize: (state): PersistedUi => ({
          locale: state.locale,
          recentServiceIds: state.recentServiceIds,
          favoriteServiceIds: state.favoriteServiceIds,
          homeLayout: state.homeLayout,
        }),
        // Validation and migration already ran in getItem, so this only runs for a
        // version mismatch that getItem never returns.
        migrate: (state) => state as PersistedUi,
        onRehydrateStorage: () => (_state, error) => {
          store.setState({
            hydrated: true,
            storageProblem: error === undefined ? loadProblem : 'unreadable',
          });
        },
      },
    ),
  );
  return store;
}

function defaultKeyValue(): KeyValueStore {
  return typeof indexedDB === 'undefined' ? createMemoryKeyValue() : createIdbKeyValue();
}

/** The app's UI store. Tests that need their own backend call `createUiStore`. */
export const uiStore = createUiStore(
  defaultKeyValue(),
  detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages),
);

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}
