import { z } from 'zod';
import { useStore } from 'zustand';
import { persist } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { LOCALES, detectLocale, type Locale } from '../i18n/locales';
import { createIdbKeyValue, createMemoryKeyValue, type KeyValueStore } from './keyValue';
import { backupKeyFor, createValidatedStorage, type StorageProblem } from './persistence';

/**
 * UI store: language, recently visited services, favorites, the Console Home layout and the
 * session's "Filter by VPC". It holds no topology data (AGENTS.md, architecture rule 5).
 * Persistence (rule 7) goes through `createValidatedStorage` in `persistence.ts`.
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

export type { StorageProblem } from './persistence';

export interface UiState extends PersistedUi {
  readonly hydrated: boolean;
  readonly storageProblem: StorageProblem | null;
  /** "Filter by VPC" of the reproduced consoles. Session only: not persisted. */
  readonly vpcFilter: string | null;
  readonly setLocale: (locale: Locale) => void;
  readonly visitService: (serviceId: string) => void;
  readonly toggleFavorite: (serviceId: string) => void;
  readonly setHomeLayout: (layout: readonly HomeLayoutItem[]) => void;
  readonly setVpcFilter: (vpcId: string | null) => void;
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
  return backupKeyFor(UI_STORE_KEY, date);
}

export function createUiStore(kv: KeyValueStore, initialLocale: Locale): StoreApi<UiState> {
  const { storage, loadProblem } = createValidatedStorage<PersistedUi>({
    kv,
    name: UI_STORE_KEY,
    version: UI_STORE_VERSION,
    schema: persistedUiSchema,
    migrate: migrateUiState,
    // Guarded so a storage that keeps failing cannot loop through setState -> setItem.
    onSaveFailed: () => {
      if (store.getState().storageProblem !== 'save-failed') {
        store.setState({ storageProblem: 'save-failed' });
      }
    },
  });

  const store = createStore<UiState>()(
    persist(
      (set) => ({
        ...defaultPersistedUi(initialLocale),
        hydrated: false,
        storageProblem: null,
        vpcFilter: null,
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
        setVpcFilter: (vpcId) => {
          set({ vpcFilter: vpcId });
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
            storageProblem: error === undefined ? loadProblem() : 'unreadable',
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
