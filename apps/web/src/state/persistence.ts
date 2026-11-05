import { z } from 'zod';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { KeyValueStore } from './keyValue';

/**
 * Validated persistence shared by every persisted store (AGENTS.md, architecture rule 7):
 * IndexedDB through `persist`, a `version` with a migration step, and Zod validation on load.
 * Data that fails validation is copied to a backup key before the store starts clean, and
 * the shell tells the user. Loading never throws.
 */

/** What went wrong with browser storage, shown once by the shell. */
export type StorageProblem = 'backed-up' | 'unreadable' | 'save-failed';

const envelopeSchema = z.object({ state: z.unknown(), version: z.number().int() });

export function backupKeyFor(name: string, date: Date): string {
  return `${name}-backup-${date.toISOString()}`;
}

export interface ValidatedStorageOptions<T> {
  readonly kv: KeyValueStore;
  /** Persist key; backups go to `<name>-backup-<ISO date>`. */
  readonly name: string;
  readonly version: number;
  readonly schema: z.ZodType<T>;
  /** Brings stored state from `fromVersion` to `version`; `undefined` means "can't". */
  readonly migrate: (state: unknown, fromVersion: number) => unknown;
  /** Called when a save fails. The store reports it; the caller avoids loops. */
  readonly onSaveFailed: () => void;
}

export interface ValidatedStorage<T> {
  readonly storage: PersistStorage<T, Promise<void>>;
  /** The problem found by the last load, if any. */
  readonly loadProblem: () => StorageProblem | null;
}

interface LoadResult<T> {
  readonly value: StorageValue<T> | null;
  readonly problem: StorageProblem | null;
}

async function load<T>(options: ValidatedStorageOptions<T>): Promise<LoadResult<T>> {
  const { kv, name, version, schema, migrate } = options;
  let raw: unknown;
  try {
    raw = await kv.get(name);
  } catch {
    return { value: null, problem: 'unreadable' };
  }
  if (raw === undefined) return { value: null, problem: null };

  const envelope = envelopeSchema.safeParse(raw);
  const parsed = envelope.success
    ? schema.safeParse(migrate(envelope.data.state, envelope.data.version))
    : undefined;
  if (parsed?.success) return { value: { state: parsed.data, version }, problem: null };

  try {
    await kv.set(backupKeyFor(name, new Date()), raw);
    return { value: null, problem: 'backed-up' };
  } catch {
    return { value: null, problem: 'unreadable' };
  }
}

/** A `persist` storage that validates on load and backs up what it can't read. */
export function createValidatedStorage<T>(
  options: ValidatedStorageOptions<T>,
): ValidatedStorage<T> {
  let problem: StorageProblem | null = null;
  return {
    storage: {
      getItem: async () => {
        const result = await load(options);
        problem = result.problem;
        return result.value;
      },
      setItem: async (name, value) => {
        try {
          await options.kv.set(name, value);
        } catch {
          options.onSaveFailed();
        }
      },
      removeItem: () => Promise.resolve(),
    },
    loadProblem: () => problem,
  };
}
