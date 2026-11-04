import {
  consoleNavs,
  servicesFile,
  type ConsoleNav,
  type NavItem,
  type Service,
} from '@sim/catalog';

/**
 * Route table built from the catalog's side-navigation files, so every captured route
 * exists in the app (CAT-05 in the catalog skill's data model). Pure data: the router
 * turns it into route objects, and tests check it without rendering.
 */

export const REFERENCE_PREFIX = '/reference';

export type ConsolePageKind = 'functional' | 'empty';

export interface ConsolePage {
  readonly path: string;
  readonly serviceId: string;
  readonly label: string;
  readonly kind: ConsolePageKind;
}

export const servicesById: ReadonlyMap<string, Service> = new Map(
  servicesFile.services.map((service) => [service.id, service]),
);

/** Header first, then every section item, in captured order. */
export function navItems(nav: ConsoleNav): NavItem[] {
  return [nav.header, ...nav.sections.flatMap((section) => section.items)];
}

export function referencePath(serviceId: string): string {
  return `${REFERENCE_PREFIX}/${serviceId}`;
}

/** Where opening a service goes: its console when simulated, its reference page otherwise. */
export function serviceHref(service: Service): string {
  const nav = consoleNavs[service.id];
  if (service.kind === 'simulated' && nav?.header.route !== undefined) return nav.header.route;
  return referencePath(service.id);
}

export function serviceHrefById(serviceId: string): string {
  const service = servicesById.get(serviceId);
  if (!service) throw new Error(`Unknown service id "${serviceId}"`);
  return serviceHref(service);
}

/** The schema guarantees a route, or a serviceId for target "service" (CAT-05). */
export function navItemHref(item: NavItem): string {
  if (item.target === 'service') {
    if (item.serviceId === undefined) throw new Error(`Nav item "${item.label}" has no serviceId`);
    return serviceHrefById(item.serviceId);
  }
  if (item.route === undefined) throw new Error(`Nav item "${item.label}" has no route`);
  return item.route;
}

function pageKind(item: NavItem): ConsolePageKind {
  switch (item.target) {
    case 'functional':
      return 'functional';
    // R0 captures have no "reference" items; until per-page cards exist they open the
    // same realistic empty page.
    case 'reference':
    case 'empty':
      return 'empty';
    case 'service':
      throw new Error(`Nav item "${item.label}" opens a service, not a console page`);
  }
}

/** Every console page from the nav files: header and items, except items that open a service. */
export function consolePages(
  navs: Readonly<Record<string, ConsoleNav>> = consoleNavs,
): ConsolePage[] {
  return Object.values(navs).flatMap((nav) =>
    navItems(nav)
      .filter((item) => item.target !== 'service')
      .map((item) => ({
        path: navItemHref(item),
        serviceId: nav.serviceId,
        label: item.label,
        kind: pageKind(item),
      })),
  );
}
