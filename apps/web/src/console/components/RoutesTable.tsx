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
 * `vpc-virtual_private_cloud-route_tables-selection-routes_tab.txt` (2026-11-03 and
 * 2026-11-05). `columns="destination-target"` is the preview on the subnet's Replace route
 * table page (`vpc-virtual_private_cloud-subnets-selection-replace_route_table.txt`).
 */
export function RoutesTable({
  routes,
  header,
  columns = 'all',
}: {
  routes: readonly RouteStatus[];
  header?: ReactNode;
  columns?: 'all' | 'destination-target';
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
        ...(columns === 'all'
          ? [
              {
                id: 'status',
                header: 'Status',
                cell: (route: RouteStatus) => STATE_LABEL[route.state],
              },
              { id: 'propagated', header: 'Propagated', cell: () => 'No' },
              {
                id: 'origin',
                header: 'Route Origin',
                cell: (route: RouteStatus) => ORIGIN_LABEL[route.origin],
              },
            ]
          : []),
      ]}
    />
  );
}
