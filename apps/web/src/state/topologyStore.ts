import {
  newErrors,
  topologySchema,
  type HelperError,
  type HelperResult,
  type Issue,
  type Topology,
} from '@sim/engine';
import { z } from 'zod';
import { useStore } from 'zustand';
import { persist } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { EMPTY_TOPOLOGY } from '../topology/emptyTopology';
import { createIdbKeyValue, createMemoryKeyValue, type KeyValueStore } from './keyValue';
import { createValidatedStorage, type StorageProblem } from './persistence';

/**
 * Topology store: the one source of truth the console views, canvas and YAML editor edit
 * (AGENTS.md, architecture rule 4). It holds one topology per workspace: the sandbox and
 * one per lab, so starting a lab never overwrites the sandbox. UI state (positions,
 * selection, layout) lives in the UI store (rule 5).
 *
 * Every console change runs an engine helper, then `newErrors`: a change that adds
 * `validate()` errors is rejected, as the AWS API would (docs/specs/r0-engine.md 3.8).
 * Persistence (rule 7) goes through `createValidatedStorage`.
 */

export const TOPOLOGY_STORE_KEY = 'sim-topology';
export const TOPOLOGY_STORE_VERSION = 1;
export const SANDBOX_WORKSPACE = 'sandbox';

/** `sandbox`, or `lab-<id>` for a lab. */
export const workspaceIdSchema = z.string().regex(/^(sandbox|lab-[a-z0-9-]{1,64})$/);

export const persistedTopologySchema = z
  .strictObject({
    activeWorkspaceId: workspaceIdSchema,
    workspaces: z.record(workspaceIdSchema, topologySchema),
  })
  .refine((value) => Object.hasOwn(value.workspaces, value.activeWorkspaceId), {
    message: 'The active workspace must exist',
    path: ['activeWorkspaceId'],
  });

export type PersistedTopology = z.output<typeof persistedTopologySchema>;

export function defaultPersistedTopology(): PersistedTopology {
  return {
    activeWorkspaceId: SANDBOX_WORKSPACE,
    workspaces: { [SANDBOX_WORKSPACE]: EMPTY_TOPOLOGY },
  };
}

/** Version 1 is the first one; an unknown version fails validation and is backed up. */
export function migrateTopologyState(state: unknown, fromVersion: number): unknown {
  return fromVersion === TOPOLOGY_STORE_VERSION ? state : undefined;
}

/** What a console change did: the created IDs, or why it was rejected. */
export type ChangeOutcome<T> =
  | { readonly ok: true; readonly created: T }
  | { readonly ok: false; readonly error: HelperError }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export interface TopologyState extends PersistedTopology {
  readonly hydrated: boolean;
  readonly storageProblem: StorageProblem | null;
  /** Runs `change` on the active topology and commits it unless it adds errors. */
  readonly apply: <T>(change: (topology: Topology) => HelperResult<T>) => ChangeOutcome<T>;
  /** Replaces the active topology (YAML editor commit). The caller validated it. */
  readonly replaceActiveTopology: (topology: Topology) => void;
  /** Activates a workspace, creating it from `initial` when it doesn't exist yet. */
  readonly openWorkspace: (workspaceId: string, initial: Topology) => void;
  readonly dismissStorageProblem: () => void;
}

export function activeTopology(state: PersistedTopology): Topology {
  return state.workspaces[state.activeWorkspaceId] ?? EMPTY_TOPOLOGY;
}

export function createTopologyStore(kv: KeyValueStore): StoreApi<TopologyState> {
  const { storage, loadProblem } = createValidatedStorage<PersistedTopology>({
    kv,
    name: TOPOLOGY_STORE_KEY,
    version: TOPOLOGY_STORE_VERSION,
    schema: persistedTopologySchema,
    migrate: migrateTopologyState,
    onSaveFailed: () => {
      if (store.getState().storageProblem !== 'save-failed') {
        store.setState({ storageProblem: 'save-failed' });
      }
    },
  });

  const store = createStore<TopologyState>()(
    persist(
      (set, get) => ({
        ...defaultPersistedTopology(),
        hydrated: false,
        storageProblem: null,
        apply: (change) => {
          const state = get();
          const before = activeTopology(state);
          const result = change(before);
          if (!result.ok) return { ok: false, error: result.error };
          const issues = newErrors(before, result.topology);
          if (issues.length > 0) return { ok: false, issues };
          set({
            workspaces: { ...state.workspaces, [state.activeWorkspaceId]: result.topology },
          });
          return { ok: true, created: result.created };
        },
        replaceActiveTopology: (topology) => {
          set((state) => ({
            workspaces: { ...state.workspaces, [state.activeWorkspaceId]: topology },
          }));
        },
        openWorkspace: (workspaceId, initial) => {
          set((state) => ({
            activeWorkspaceId: workspaceId,
            workspaces: Object.hasOwn(state.workspaces, workspaceId)
              ? state.workspaces
              : { ...state.workspaces, [workspaceId]: initial },
          }));
        },
        dismissStorageProblem: () => {
          set({ storageProblem: null });
        },
      }),
      {
        name: TOPOLOGY_STORE_KEY,
        version: TOPOLOGY_STORE_VERSION,
        storage,
        partialize: (state): PersistedTopology => ({
          activeWorkspaceId: state.activeWorkspaceId,
          workspaces: state.workspaces,
        }),
        // Validation and migration already ran in getItem.
        migrate: (state) => state as PersistedTopology,
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
    : createIdbKeyValue('sim-topology', 'topology');
}

/** The app's topology store. Tests that need their own backend call `createTopologyStore`. */
export const topologyStore = createTopologyStore(defaultKeyValue());

export function useTopologyStore<T>(selector: (state: TopologyState) => T): T {
  return useStore(topologyStore, selector);
}

/** The topology of the active workspace. */
export function useTopology(): Topology {
  return useTopologyStore(activeTopology);
}
