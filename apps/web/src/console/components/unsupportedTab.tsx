import type { TabsProps } from '@cloudscape-design/components/tabs';
import { UnsupportedNotice } from './DetailsPanel';

/** A captured tab R0 doesn't simulate. */
export function unsupportedTab(id: string, label: string): TabsProps.Tab {
  return { id, label, content: <UnsupportedNotice /> };
}
