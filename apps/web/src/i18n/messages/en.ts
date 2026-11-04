/**
 * English UI strings: the source of truth for message keys. `es.ts` must define every key
 * (enforced by its type). Catalog names (services, categories, menu views, side-navigation
 * labels) are not here: they stay as captured.
 *
 * Placeholders use `{name}`. Plural messages use `_one` / `_other` suffixes and are read
 * with `tPlural`.
 */
export const en = {
  'banner.text': 'Independent educational simulator — not connected to any AWS account',

  'footer.trademark':
    'Amazon Web Services, AWS and related marks are trademarks of Amazon.com, Inc. or its affiliates.',
  'footer.disclaimer':
    '{product} is an independent educational project. It is not affiliated with, sponsored by or endorsed by Amazon Web Services.',

  'top.logoAlt': '{product} logo',
  'top.language': 'Language',
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

  'storage.backedUp':
    'Saved settings could not be loaded, so the app started clean. A backup copy of the old data was kept in this browser.',
  'storage.unreadable': 'Saved settings could not be read, so the app started clean.',
  'storage.saveFailed':
    'Settings could not be saved in this browser. Changes last until you close the tab.',
  'storage.dismiss': 'Dismiss',

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
  'home.labs.title': 'Labs in progress',
  'home.labs.empty': 'No labs in progress',
  'home.labs.emptyHint': 'Labs you start appear here.',
  'home.health.title': 'Topology health',
  'home.health.ok': 'No issues found',
  'home.health.issues_one': '{count} issue found',
  'home.health.issues_other': '{count} issues found',
  'home.health.resources': 'Resources in the topology',
  'home.health.vpcs': 'VPCs',
  'home.health.subnets': 'Subnets',
  'home.health.instances': 'Instances',
  'home.health.severity.error': 'Error',
  'home.health.severity.warning': 'Warning',
  'home.cost.title': 'Estimated cost of this topology',
  'home.cost.empty': 'No price snapshot yet',
  'home.cost.emptyHint':
    'Estimates appear once the build includes a dated snapshot of the AWS Price List.',

  'functional.status': 'Coming with lab 1',
  'functional.hint': 'This view becomes functional with lab 1.',

  'empty.title': 'No resources',
  'empty.hint': 'There are no resources to display in this simulated account.',

  'notFound.title': 'Page not found',
  'notFound.hint': 'This address does not match any page in the console.',
  'notFound.home': 'Go to Console Home',

  'reference.notice': "Reference only: this service isn't simulated",
  'reference.noCard': 'No card yet.',
  'reference.docsLink': 'Official documentation',
  'reference.simulatedNotice': 'This service is simulated',
  'reference.openConsole': 'Open the {name} console',
  'reference.details': 'Details',
  'reference.category': 'Category',
  'reference.examScope': 'Exam scope',
  'reference.examNone': 'Not in the CLF-C02 or SAA-C03 in-scope lists',
  'reference.cardStatus': 'Card status',
  'reference.card': 'Reference card',
  'reference.examCues': 'Exam cues',
  'reference.notToConfuseWith': 'Not to confuse with',
  'reference.pricingModel': 'Pricing model',
  'reference.sharedResponsibility': 'Shared responsibility',
  'reference.responsibilityAws': 'AWS',
  'reference.responsibilityCustomer': 'Customer',
  'reference.sources': 'Sources',
  'reference.accessedOn': 'accessed {date}',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;
