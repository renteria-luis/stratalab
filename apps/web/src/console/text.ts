import { format, type MessageParams } from '../i18n/translate';

/**
 * Console text of the shell: English only, as the real console shows it, never translated
 * (AGENTS.md, "Language"). Simulator text lives in `i18n/messages`. Console pages keep their
 * own captured labels next to their code.
 */
export const CONSOLE_TEXT = {
  'top.accountId': 'Account ID: {id}',
  'top.overflowMenuTrigger': 'More',
  'top.overflowMenuTitle': 'All',
  'top.searchIconAriaLabel': 'Search',
  'top.searchDismissIconAriaLabel': 'Close search',
  'search.placeholder': 'Search [Alt+S]',
  'search.ariaLabel': 'Search services',
  'search.empty': 'No services match your search',
  'menu.button': 'Services',
  'menu.dialogLabel': 'Services menu',
  'menu.viewsLabel': 'Views',
  'menu.categoriesLabel': 'Categories',
  'menu.close': 'Close services menu',
  'menu.favorite': 'Favorite: {name}',
  'menu.recent.empty': 'No recently visited services',
  'menu.recent.emptyHint': 'Services you open appear here.',
  'menu.favorites.empty': 'No favorites yet',
  'menu.favorites.emptyHint': 'Use the star next to a service to add it here.',
  'menu.applications.empty': 'No applications',
  'menu.applications.emptyHint': 'This simulated account has no applications.',
  'nav.opensInNewTab': 'Opens in a new tab',
  'nav.badgeNew': 'New',
  'nav.filterNoOptions': 'No options available',
  'breadcrumbs.ariaLabel': 'Breadcrumbs',
  'breadcrumbs.expandAriaLabel': 'Show path',
  'home.title': 'Console Home',
  'home.board.empty': 'No widgets',
  'home.board.navigation': 'Board navigation',
  'home.board.emptySlot': 'Empty',
  'home.board.dragHandle': 'Drag handle',
  'home.board.resizeHandle': 'Resize handle',
  'home.board.handleDescription':
    'Use Space or Enter to activate, arrow keys to move, Space or Enter to submit, or Escape to discard.',
  'home.board.started.reorder': 'Moving widget',
  'home.board.started.resize': 'Resizing widget',
  'home.board.started.insert': 'Inserting widget',
  'home.board.reordered': 'Widget moved to column {column}, row {row}.',
  'home.board.resized': 'Widget resized to {width} columns and {height} rows.',
  'home.board.inserted': 'Widget inserted at column {column}, row {row}.',
  'home.board.committed': 'Changes applied.',
  'home.board.discarded': 'Changes discarded.',
  'home.board.removed': 'Widget removed.',
  'home.recent.title': 'Recently visited',
  'empty.title': 'No resources',
  'empty.hint': 'There are no resources to display in this simulated account.',
} as const;

export type ConsoleTextKey = keyof typeof CONSOLE_TEXT;

/** Console text with `{name}` placeholders filled. */
export function ct(key: ConsoleTextKey, params?: MessageParams): string {
  return format(CONSOLE_TEXT[key], params);
}
