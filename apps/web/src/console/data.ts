import { deriveStatus, type HelperResult, type Status, type Topology } from '@sim/engine';
import { useMemo } from 'react';
import {
  topologyStore,
  useTopology,
  useTopologyStore,
  type ChangeOutcome,
} from '../state/topologyStore';
import { useUi } from '../state/uiStore';

/**
 * Region facts the console shows. Sources:
 * - Region name: https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-availability-zones.html
 *   (us-east-1, "US East (N. Virginia)"; the VPC dashboard capture shows the short form).
 * - Six Availability Zones in us-east-1 (use1-az1 to use1-az6), same page, checked 2026-11-04.
 *   Zone names (a to f) map to zone IDs per account; R0 doesn't model zone IDs.
 */
const REGIONS: Readonly<Record<string, { readonly shortName: string; readonly zones: number }>> = {
  'us-east-1': { shortName: 'N. Virginia', zones: 6 },
};

export function regionShortName(region: string): string {
  return REGIONS[region]?.shortName ?? region;
}

/** Availability Zone names of the region, or just `<region>a` for regions R0 doesn't list. */
export function availabilityZones(region: string): string[] {
  const count = REGIONS[region]?.zones ?? 1;
  return Array.from({ length: count }, (_, i) => `${region}${String.fromCharCode(97 + i)}`);
}

/** `deriveStatus` of the active topology (RT-01, RT-08, RT-09, NACL-01, IGW-05, ADR-04). */
export function useStatus(): Status {
  const topology = useTopology();
  return useMemo(() => deriveStatus(topology), [topology]);
}

export function useTopologyReady(): boolean {
  return useTopologyStore((state) => state.hydrated);
}

/** Items of the VPC chosen in "Filter by VPC", or all items when none is chosen. */
export function useVpcFiltered<T>(
  items: readonly T[],
  vpcOf: (item: T) => string | undefined,
): T[] {
  const vpcFilter = useUi((state) => state.vpcFilter);
  return vpcFilter === null ? [...items] : items.filter((item) => vpcOf(item) === vpcFilter);
}

/** Runs a change on the active topology (see `TopologyState.apply`). */
export function applyChange<T>(change: (topology: Topology) => HelperResult<T>): ChangeOutcome<T> {
  return topologyStore.getState().apply(change);
}

export function vpcOfSubnet(topology: Topology, subnetId: string): string | undefined {
  return topology.subnets.find((subnet) => subnet.id === subnetId)?.vpcId;
}

export function nameOf(item: { readonly name?: string }): string | undefined {
  return item.name;
}
