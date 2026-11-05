import { topologySchema, type Topology } from '@sim/engine';

/**
 * The sandbox topology a new browser starts with: no resources. The default VPC is
 * Unsupported in R0 (docs/specs/r0-engine.md section 9). Region as in section 2.
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
