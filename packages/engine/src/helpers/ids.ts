import type { Topology } from '../schema';
import type { IdPrefix } from './types';

/** Our ID format allows 1 to 17 hex characters after the prefix (r0-engine.md section 2). */
const MAX_HEX_LENGTH = 17;
const MIN_HEX_LENGTH = 8;

/** Every ID in the topology, in collection order. */
function allIds(topology: Topology): string[] {
  return [
    ...topology.vpcs.map((vpc) => vpc.id),
    ...topology.subnets.map((subnet) => subnet.id),
    ...topology.routeTables.map((table) => table.id),
    ...topology.internetGateways.map((igw) => igw.id),
    ...topology.securityGroups.flatMap((group) => [
      group.id,
      ...group.inboundRules.map((rule) => rule.id),
      ...group.outboundRules.map((rule) => rule.id),
    ]),
    ...topology.networkAcls.map((acl) => acl.id),
    ...topology.instances.flatMap((instance) => [instance.id, instance.primaryNetworkInterface.id]),
  ];
}

function format(prefix: IdPrefix, value: bigint): string {
  return `${prefix}-${value.toString(16).padStart(MIN_HEX_LENGTH, '0')}`;
}

/** Hands out new IDs, one prefix at a time, without reusing any ID it has seen or given. */
export type IdAllocator = (prefix: IdPrefix) => string;

/**
 * IDs for one helper call (r0-engine.md section 3.8): the largest existing value of the
 * prefix plus one, at least 8 hex characters. When that needs more than 17 characters, the
 * smallest unused value from 1. Deterministic: same topology, same calls, same IDs.
 */
export function createIdAllocator(topology: Topology): IdAllocator {
  const used = new Map<IdPrefix, Set<bigint>>();
  const ids = allIds(topology);

  const usedFor = (prefix: IdPrefix): Set<bigint> => {
    let values = used.get(prefix);
    if (values === undefined) {
      const pattern = new RegExp(`^${prefix}-([0-9a-f]{1,${String(MAX_HEX_LENGTH)}})$`);
      values = new Set(
        ids.flatMap((id) => {
          const hex = pattern.exec(id)?.[1];
          return hex === undefined ? [] : [BigInt(`0x${hex}`)];
        }),
      );
      used.set(prefix, values);
    }
    return values;
  };

  return (prefix) => {
    const values = usedFor(prefix);
    let largest = 0n;
    for (const value of values) if (value > largest) largest = value;
    let candidate = largest + 1n;
    if (candidate.toString(16).length > MAX_HEX_LENGTH) {
      candidate = 1n;
      while (values.has(candidate)) candidate += 1n;
    }
    values.add(candidate);
    return format(prefix, candidate);
  };
}

/** The next ID for `prefix` in `topology` (r0-engine.md section 3.8). */
export function nextId(topology: Topology, prefix: IdPrefix): string {
  return createIdAllocator(topology)(prefix);
}
