import Table from '@cloudscape-design/components/table';
import type { RouteStatus } from '@sim/engine';
import type { ReactNode } from 'react';

const ORIGIN_LABEL = {
  CreateRouteTable: 'Create Route Table',
  CreateRoute: 'Create Route',
} as const;
const STATE_LABEL = { active: 'Active', blackhole: 'Blackhole' } as const;

/**
 * Routes of a route table as `deriveStatus` reports them (RT-03 local route first, RT-08
 * state). Columns and values from the capture
 * `vpc-virtual_private_cloud-route_tables-selection-routes_tab.txt` (2026-11-03).
 */
export function RoutesTable({
  routes,
  header,
}: {
  routes: readonly RouteStatus[];
  header?: ReactNode;
}) {
  return (
    <Table
      variant="embedded"
      header={header}
      items={[...routes]}
      trackBy={(route) => route.destinationCidrBlock}
      columnDefinitions={[
        { id: 'destination', header: 'Destination', cell: (route) => route.destinationCidrBlock },
        { id: 'target', header: 'Target', cell: (route) => route.target },
        { id: 'status', header: 'Status', cell: (route) => STATE_LABEL[route.state] },
        { id: 'propagated', header: 'Propagated', cell: () => 'No' },
        { id: 'origin', header: 'Route Origin', cell: (route) => ORIGIN_LABEL[route.origin] },
      ]}
    />
  );
}
