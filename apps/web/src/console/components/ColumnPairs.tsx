import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import type { ReactNode } from 'react';

export type Pair = readonly [label: string, value: ReactNode];

/**
 * Key-value pairs laid out column by column. The VPC console's page text reads the details
 * panel one column at a time (for example Subnet ID, IPv4 CIDR, … then Subnet ARN, …), so
 * each column is one untitled group; plain `items` would flow row by row instead.
 */
export function ColumnPairs({ columns }: { columns: readonly (readonly Pair[])[] }) {
  return (
    <KeyValuePairs
      columns={columns.length}
      items={columns.map((column) => ({
        type: 'group' as const,
        items: column.map(([label, value]) => ({ label, value })),
      }))}
    />
  );
}
