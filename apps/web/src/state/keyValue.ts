import { createStore, get, set } from 'idb-keyval';

/** The two calls the UI store needs from a key-value backend. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

/** IndexedDB through idb-keyval (AGENTS.md, architecture rule 7). */
export function createIdbKeyValue(dbName = 'sim', storeName = 'ui'): KeyValueStore {
  const store = createStore(dbName, storeName);
  return {
    get: (key) => get<unknown>(key, store),
    set: (key, value) => set(key, value, store),
  };
}

/** In-memory backend: tests, and browsers without IndexedDB. Values are cloned like IndexedDB does. */
export function createMemoryKeyValue(
  initial: Readonly<Record<string, unknown>> = {},
): KeyValueStore & {
  readonly entries: Map<string, unknown>;
} {
  const entries = new Map<string, unknown>(Object.entries(initial));
  return {
    entries,
    get: (key) => Promise.resolve(structuredClone(entries.get(key))),
    set: (key, value) => {
      entries.set(key, structuredClone(value));
      return Promise.resolve();
    },
  };
}
