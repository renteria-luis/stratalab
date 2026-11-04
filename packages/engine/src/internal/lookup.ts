/** Indexes resources by ID. IDs are unique after `topologySchema` parsing. */
export function indexById<T extends { readonly id: string }>(
  items: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Looks up a resource that must exist. After `topologySchema` parsing every reference
 * resolves, so a miss means the caller skipped parsing: a programming error, not user input.
 */
export function mustGet<T>(map: ReadonlyMap<string, T>, id: string): T {
  const value = map.get(id);
  if (value === undefined) {
    throw new Error(`Invariant: unknown ID ${id}. Parse the topology with topologySchema first.`);
  }
  return value;
}
