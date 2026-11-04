import { isWithin, mustParseCidr, ROUTE_RESERVED_BLOCK, formatCidr } from '../cidr';
import { mustGet } from '../internal/lookup';
import type { Model } from '../model';
import type { Issue } from './issue';

/**
 * Route and internet gateway checks of `validate()`.
 *
 * Rules:
 * - RT-11 unique and reserved destinations: https://docs.aws.amazon.com/ec2/latest/devguide/errors-overview.html
 *   and https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html
 * - RT-03 local route: https://docs.aws.amazon.com/vpc/latest/userguide/route-tables-priority.html
 * - IGW-05 one internet gateway per VPC: https://docs.aws.amazon.com/vpc/latest/userguide/amazon-vpc-limits.html
 *
 * A route to an internet gateway that isn't attached to the table's VPC is not an issue: its
 * state is `blackhole` (RT-08).
 */
export function checkRouting(model: Model): Issue[] {
  return [...checkRoutes(model), ...checkInternetGateways(model)];
}

function checkRoutes(model: Model): Issue[] {
  const issues: Issue[] = [];
  model.topology.routeTables.forEach((table, i) => {
    const vpc = mustGet(model.vpcs, table.vpcId);
    const vpcBlock = mustParseCidr(vpc.cidrBlock);
    const resource = { type: 'route-table', id: table.id } as const;
    /** Index of the first route per destination. CIDRs are canonical, so strings compare. */
    const firstIndex = new Map<string, number>();

    table.routes.forEach((route, j) => {
      const destination = route.destinationCidrBlock;
      const block = mustParseCidr(destination);
      const path = ['routeTables', i, 'routes', j, 'destinationCidrBlock'] as const;

      const first = firstIndex.get(destination);
      if (first === undefined) {
        firstIndex.set(destination, j);
      } else {
        issues.push({
          code: 'ROUTE_DUPLICATE_DESTINATION',
          severity: 'error',
          ruleIds: ['RT-11'],
          fidelity: 'Exact',
          resource,
          path,
          params: { destinationCidrBlock: destination, firstRouteIndex: first },
        });
      }

      if (isWithin(block, ROUTE_RESERVED_BLOCK)) {
        issues.push({
          code: 'ROUTE_DESTINATION_RESERVED',
          severity: 'error',
          ruleIds: ['RT-11'],
          fidelity: 'Exact',
          resource,
          path,
          params: {
            destinationCidrBlock: destination,
            reservedBlock: formatCidr(ROUTE_RESERVED_BLOCK),
          },
        });
      }

      if (isWithin(block, vpcBlock)) {
        issues.push({
          code: 'LOCAL_ROUTE_CONFLICT',
          severity: 'error',
          ruleIds: ['RT-03'],
          fidelity: 'Exact',
          resource,
          path,
          params: { destinationCidrBlock: destination, vpcCidrBlock: vpc.cidrBlock },
        });
      }
    });
  });
  return issues;
}

/** IGW-05: reported on every attached internet gateway after the first one of a VPC. */
function checkInternetGateways(model: Model): Issue[] {
  const issues: Issue[] = [];
  const firstAttached = new Map<string, string>();
  model.topology.internetGateways.forEach((igw, i) => {
    const vpcId = igw.attachedVpcId;
    if (vpcId === undefined) return;
    const first = firstAttached.get(vpcId);
    if (first === undefined) {
      firstAttached.set(vpcId, igw.id);
      return;
    }
    issues.push({
      code: 'IGW_MULTIPLE_ATTACHED',
      severity: 'error',
      ruleIds: ['IGW-05'],
      fidelity: 'Exact',
      resource: { type: 'internet-gateway', id: igw.id },
      path: ['internetGateways', i, 'attachedVpcId'],
      related: [{ type: 'internet-gateway', id: first }],
      params: { vpcId },
    });
  });
  return issues;
}
