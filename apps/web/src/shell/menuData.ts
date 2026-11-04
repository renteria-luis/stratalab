import type { IconProps } from '@cloudscape-design/components/icon';
import {
  buildSearchIndex,
  menuCategories,
  servicesFile,
  type MenuCategory,
  type Service,
} from '@sim/catalog';

/**
 * Data behind the services menu and the global search. View and category names are the
 * captured strings (catalog skill: names stay as captured); only behavior and icons are ours.
 */

export type MenuViewBehavior = 'recent' | 'favorites' | 'applications' | 'all';

/** Behavior for each captured view name in `servicesFile.menu.views`. */
export const VIEW_BEHAVIORS: Readonly<Record<string, MenuViewBehavior>> = {
  'Recently visited': 'recent',
  Favorites: 'favorites',
  'All applications': 'applications',
  'All services': 'all',
};

export const VIEW_ICONS: Readonly<Record<MenuViewBehavior, IconProps.Name>> = {
  recent: 'history',
  favorites: 'star',
  applications: 'view-full',
  all: 'list-view',
};

/**
 * Our own generic icons per captured category, from Cloudscape's built-in set. They are
 * decorative: the category name is always shown next to them. AWS Architecture Icons are
 * only for the canvas (catalog skill, branding limits).
 */
export const CATEGORY_ICONS: Readonly<Record<string, IconProps.Name>> = {
  Analytics: 'view-vertical',
  'Application Integration': 'share',
  Blockchain: 'anchor-link',
  'Business Applications': 'envelope',
  'Cloud Financial Management': 'ticket',
  Compute: 'command-prompt',
  Containers: 'grid-view',
  'Customer Enablement': 'support',
  Database: 'insert-row',
  'Developer Tools': 'script',
  'End User Computing': 'user-profile',
  'Front-end Web & Mobile': 'multiscreen',
  'Game Development': 'play',
  'Internet of Things': 'upload-download',
  'Machine Learning': 'gen-ai',
  'Management & Governance': 'settings',
  'Media Services': 'video-on',
  'Migration & Transfer': 'arrow-right',
  'Networking & Content Delivery': 'globe',
  'Quantum Technologies': 'dot',
  Satellite: 'location-pin',
  'Security, Identity, & Compliance': 'security',
  Storage: 'folder',
};

export const FALLBACK_CATEGORY_ICON: IconProps.Name = 'folder';

export type MenuGroup =
  | { readonly kind: 'view'; readonly name: string; readonly behavior: MenuViewBehavior }
  | { readonly kind: 'category'; readonly name: string; readonly services: readonly Service[] };

export const menuViews: readonly MenuGroup[] = servicesFile.menu.views.flatMap((name) => {
  const behavior = VIEW_BEHAVIORS[name];
  return behavior === undefined ? [] : [{ kind: 'view' as const, name, behavior }];
});

export const menuCategoryGroups: readonly MenuGroup[] = menuCategories(servicesFile).map(
  (group: MenuCategory) => ({
    kind: 'category' as const,
    name: group.category,
    services: group.services,
  }),
);

/** Menu and search never list retired services (CAT-07). */
export const listedServices: readonly Service[] = servicesFile.services.filter(
  (service) => service.retired !== true,
);

export const searchIndex = buildSearchIndex(servicesFile.services);
export const SEARCH_LIMIT = 20;

/** Alt+S (Option+S on a Mac), as in the real console. `code` ignores the typed character. */
export function isFocusSearchShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'code'>,
): boolean {
  return (
    event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyS'
  );
}
