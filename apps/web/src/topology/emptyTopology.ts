import { topologySchema, type Topology } from '@sim/engine';

/**
 * The topology Console Home checks until the topology store exists (P7). Region as in
 * docs/specs/r0-engine.md, section 2.
 */
export const EMPTY_TOPOLOGY: Topology = topologySchema.parse({
  schemaVersion: 1,
  region: 'us-east-1',
  vpcs: [],
  subnets: [],
  routeTables: [],
  internetGateways: [],
  securityGroups: [],
  networkAcls: [],
  instances: [],
});
