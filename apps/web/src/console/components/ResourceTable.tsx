import Box from '@cloudscape-design/components/box';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Pagination from '@cloudscape-design/components/pagination';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import { useMemo, useState, type ReactNode } from 'react';
import { DASH } from './values';

const PAGE_SIZE = 25;

/** The editable Name: the shown value without the empty mark. */
const nameOf = (shown: string) => (shown === DASH ? '' : shown);

export interface ResourceColumn<T> {
  readonly id: string;
  /** Column header as captured. */
  readonly header: string;
  /** Plain text of the cell: used for display (unless `render`), filtering and sorting. */
  readonly value: (item: T) => string;
  readonly render?: (item: T) => ReactNode;
  /** Inline edit of the Name tag, as the console's pencil icon. */
  readonly editName?: (item: T, name: string) => void;
}

export interface ResourceTableProps<T> {
  /** Table title as captured, for example "Your VPCs". */
  readonly title: string;
  /** What the table lists, for screen readers and the filter, for example "VPCs". */
  readonly resourceName: string;
  readonly items: readonly T[];
  readonly columns: readonly ResourceColumn<T>[];
  readonly trackBy: (item: T) => string;
  readonly selectedIds: readonly string[];
  readonly onSelectionChange: (ids: string[]) => void;
  readonly actions?: ReactNode;
  readonly empty: {
    readonly title: string;
    readonly description: string;
    readonly action?: ReactNode;
  };
  readonly loading?: boolean;
}

/**
 * A console resource list: header with counter "(n)" or "(selected/n)", actions, text
 * filter, pagination and checkbox selection, as in the captured VPC and EC2 tables.
 */
export function ResourceTable<T>({
  title,
  resourceName,
  items,
  columns,
  trackBy,
  selectedIds,
  onSelectionChange,
  actions,
  empty,
  loading = false,
}: ResourceTableProps<T>) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === '') return items;
    return items.filter((item) =>
      columns.some((column) => column.value(item).toLowerCase().includes(needle)),
    );
  }, [items, columns, filter]);

  const pagesCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pagesCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedItems = items.filter((item) => selectedIds.includes(trackBy(item)));

  const columnDefinitions = columns.map((column): TableProps.ColumnDefinition<T> => ({
    id: column.id,
    header: column.header,
    cell: (item) => column.render?.(item) ?? column.value(item),
    sortingComparator: (a, b) => column.value(a).localeCompare(column.value(b)),
    ...(column.editName === undefined
      ? {}
      : {
          editConfig: {
            ariaLabel: column.header,
            editIconAriaLabel: 'editable',
            editingCell: (item, { currentValue, setValue }) => (
              <Input
                autoFocus
                ariaLabel={column.header}
                value={(currentValue as string | undefined) ?? nameOf(column.value(item))}
                onChange={({ detail }) => {
                  setValue(detail.value);
                }}
              />
            ),
          },
        }),
  }));

  const counter =
    selectedItems.length > 0
      ? `(${String(selectedItems.length)}/${String(items.length)})`
      : `(${String(items.length)})`;

  return (
    <Table<T>
      variant="full-page"
      items={pageItems}
      columnDefinitions={columnDefinitions}
      trackBy={trackBy}
      loading={loading}
      selectionType="multi"
      selectedItems={selectedItems}
      onSelectionChange={({ detail }) => {
        onSelectionChange(detail.selectedItems.map(trackBy));
      }}
      ariaLabels={{
        tableLabel: title,
        selectionGroupLabel: `${resourceName} selection`,
        allItemsSelectionLabel: () => 'select all',
        itemSelectionLabel: (_data, item) => trackBy(item),
      }}
      resizableColumns
      wrapLines={false}
      stickyHeader
      submitEdit={(item, column, value) => {
        const definition = columns.find((candidate) => candidate.id === column.id);
        definition?.editName?.(item, typeof value === 'string' ? value.trim() : '');
      }}
      header={
        <Header variant="awsui-h1-sticky" counter={counter} actions={actions}>
          {title}
        </Header>
      }
      filter={
        <TextFilter
          filteringText={filter}
          filteringPlaceholder={`Find ${resourceName}`}
          filteringAriaLabel={`Find ${resourceName}`}
          countText={`${String(filtered.length)} matches`}
          onChange={({ detail }) => {
            setFilter(detail.filteringText);
            setPage(1);
          }}
        />
      }
      pagination={
        <Pagination
          currentPageIndex={currentPage}
          pagesCount={pagesCount}
          onChange={({ detail }) => {
            setPage(detail.currentPageIndex);
          }}
        />
      }
      empty={
        <Box textAlign="center" color="inherit" padding={{ vertical: 'l' }}>
          <SpaceBetween size="xxs">
            <Box variant="strong" color="inherit">
              {empty.title}
            </Box>
            <Box variant="p" color="inherit">
              {empty.description}
            </Box>
            {empty.action}
          </SpaceBetween>
        </Box>
      }
    />
  );
}
