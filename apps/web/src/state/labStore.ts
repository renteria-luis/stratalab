import { z } from 'zod';
import { useStore } from 'zustand';
import { persist } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createIdbKeyValue, createMemoryKeyValue, type KeyValueStore } from './keyValue';
import { createValidatedStorage, type StorageProblem } from './persistence';

/**
 * Lab progress, kept in this browser only (catalog skill, lab mode): which lab is open,
 * hints the learner asked for, traces they ran and pages they visited outside the
 * solution path ("wrong turns", shown only in the review after the lab ends).
 * Persistence (AGENTS.md, rule 7) goes through `createValidatedStorage`.
 */

export const LAB_STORE_KEY = 'sim-labs';
export const LAB_STORE_VERSION = 1;
export const WRONG_TURN_LIMIT = 100;

const labIdSchema = z.string().regex(/^lab-[a-z0-9-]{1,64}$/);

export const labProgressSchema = z.strictObject({
  status: z.enum(['in-progress', 'completed']),
  hintsUsed: z.number().int().min(0).max(1000),
  tracesRun: z.number().int().min(0).max(1_000_000),
  wrongTurns: z.array(z.string().min(1).max(500)).max(WRONG_TURN_LIMIT),
});

export const persistedLabsSchema = z.strictObject({
  activeLabId: labIdSchema.nullable(),
  progress: z.record(labIdSchema, labProgressSchema),
});

export type LabProgress = z.output<typeof labProgressSchema>;
export type PersistedLabs = z.output<typeof persistedLabsSchema>;

export function defaultPersistedLabs(): PersistedLabs {
  return { activeLabId: null, progress: {} };
}

const freshProgress = (): LabProgress => ({
  status: 'in-progress',
  hintsUsed: 0,
  tracesRun: 0,
  wrongTurns: [],
});

export interface LabState extends PersistedLabs {
  readonly hydrated: boolean;
  readonly storageProblem: StorageProblem | null;
  /** Opens a lab; `restart` clears its progress. */
  readonly openLab: (labId: string, restart: boolean) => void;
  readonly leaveLab: () => void;
  readonly takeHint: (labId: string) => void;
  readonly recordTrace: () => void;
  /** Records `path` as a wrong turn unless it starts with one of `relevant`. */
  readonly recordVisit: (path: string, relevant: readonly string[]) => void;
  readonly completeLab: (labId: string) => void;
  readonly dismissStorageProblem: () => void;
}

/** True when `path` is one of `prefixes` or a page under it. */
export function isUnder(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function createLabStore(kv: KeyValueStore): StoreApi<LabState> {
  const { storage, loadProblem } = createValidatedStorage<PersistedLabs>({
    kv,
    name: LAB_STORE_KEY,
    version: LAB_STORE_VERSION,
    schema: persistedLabsSchema,
    migrate: (state, fromVersion) => (fromVersion === LAB_STORE_VERSION ? state : undefined),
    onSaveFailed: () => {
      if (store.getState().storageProblem !== 'save-failed') {
        store.setState({ storageProblem: 'save-failed' });
      }
    },
  });

  const updateActive = (change: (progress: LabProgress) => LabProgress) => {
    const { activeLabId, progress } = store.getState();
    if (activeLabId === null) return;
    store.setState({
      progress: { ...progress, [activeLabId]: change(progress[activeLabId] ?? freshProgress()) },
    });
  };

  const store = createStore<LabState>()(
    persist(
      (set) => ({
        ...defaultPersistedLabs(),
        hydrated: false,
        storageProblem: null,
        openLab: (labId, restart) => {
          set((state) => ({
            activeLabId: labId,
            progress: {
              ...state.progress,
              [labId]: restart ? freshProgress() : (state.progress[labId] ?? freshProgress()),
            },
          }));
        },
        leaveLab: () => {
          set({ activeLabId: null });
        },
        takeHint: (labId) => {
          set((state) => {
            const current = state.progress[labId] ?? freshProgress();
            return {
              progress: {
                ...state.progress,
                [labId]: { ...current, hintsUsed: current.hintsUsed + 1 },
              },
            };
          });
        },
        recordTrace: () => {
          updateActive((progress) => ({ ...progress, tracesRun: progress.tracesRun + 1 }));
        },
        recordVisit: (path, relevant) => {
          if (path === '/' || isUnder(path, relevant)) return;
          updateActive((progress) =>
            progress.status === 'completed' ||
            progress.wrongTurns.includes(path) ||
            progress.wrongTurns.length >= WRONG_TURN_LIMIT
              ? progress
              : { ...progress, wrongTurns: [...progress.wrongTurns, path] },
          );
        },
        completeLab: (labId) => {
          set((state) => ({
            progress: {
              ...state.progress,
              [labId]: { ...(state.progress[labId] ?? freshProgress()), status: 'completed' },
            },
          }));
        },
        dismissStorageProblem: () => {
          set({ storageProblem: null });
        },
      }),
      {
        name: LAB_STORE_KEY,
        version: LAB_STORE_VERSION,
        storage,
        partialize: (state): PersistedLabs => ({
          activeLabId: state.activeLabId,
          progress: state.progress,
        }),
        migrate: (state) => state as PersistedLabs,
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
  return typeof indexedDB === 'undefined'
    ? createMemoryKeyValue()
    : createIdbKeyValue('sim-labs', 'labs');
}

export const labStore = createLabStore(defaultKeyValue());

export function useLabs<T>(selector: (state: LabState) => T): T {
  return useStore(labStore, selector);
}
