import type { BoardProps } from '@cloudscape-design/board-components/board';
import type { HomeLayoutItem } from '../../state/uiStore';

/** Console Home widgets from the catalog skill, in default order. */
export const WIDGET_IDS = [
  'recently-visited',
  'labs-in-progress',
  'topology-health',
  'estimated-cost',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

const DEFINITION = { defaultColumnSpan: 2, defaultRowSpan: 3, minRowSpan: 2 } as const;

const isWidgetId = (id: string): id is WidgetId => WIDGET_IDS.some((widget) => widget === id);

/**
 * Board items from the stored layout: stored order and sizes first, unknown ids dropped,
 * widgets missing from the stored layout appended with their defaults.
 */
export function applyLayout(stored: readonly HomeLayoutItem[] | null): BoardProps.Item<WidgetId>[] {
  const known = (stored ?? []).filter((item) => isWidgetId(item.id));
  const seen = new Set<string>();
  const items: BoardProps.Item<WidgetId>[] = [];
  for (const item of known) {
    if (seen.has(item.id) || !isWidgetId(item.id)) continue;
    seen.add(item.id);
    items.push({
      id: item.id,
      data: item.id,
      definition: DEFINITION,
      columnSpan: item.columnSpan,
      rowSpan: item.rowSpan,
      columnOffset: item.columnOffset,
    });
  }
  for (const id of WIDGET_IDS) {
    if (!seen.has(id)) items.push({ id, data: id, definition: DEFINITION });
  }
  return items;
}

/** The part of a board item worth persisting. */
export function toLayout(item: BoardProps.Item<WidgetId>): HomeLayoutItem {
  return {
    id: item.id,
    ...(item.columnSpan === undefined ? {} : { columnSpan: item.columnSpan }),
    ...(item.rowSpan === undefined ? {} : { rowSpan: item.rowSpan }),
    ...(item.columnOffset === undefined ? {} : { columnOffset: { ...item.columnOffset } }),
  };
}
