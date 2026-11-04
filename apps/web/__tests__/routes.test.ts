import { consoleNavs, servicesFile } from '@sim/catalog';
import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { consolePages, navItemHref, navItems, serviceHref } from '../src/routes/appRoutes';
import { isPageHandle, type PageHandle } from '../src/routes/pageHandle';
import { appRouteObjects } from '../src/routes/router';

const routes = appRouteObjects();

function resolve(path: string): { handle: PageHandle; params: Record<string, string | undefined> } {
  const leaf = matchRoutes(routes, path)?.at(-1);
  const handle: unknown = leaf?.route.handle;
  if (!leaf || !isPageHandle(handle)) throw new Error(`No page for ${path}`);
  return { handle, params: leaf.params };
}

const allItems = Object.values(consoleNavs).flatMap(navItems);

describe('router', () => {
  it('CAT-05: every functional route exists in the app as a functional page', () => {
    const functional = allItems.filter((item) => item.target === 'functional');
    expect(functional.length).toBeGreaterThan(0);
    for (const item of functional) {
      const { handle } = resolve(navItemHref(item));
      expect(handle.page, item.label).toBe('console');
      if (handle.page !== 'console') continue;
      expect(handle.consolePage.kind, item.label).toBe('functional');
      expect(handle.consolePage.path).toBe(item.route);
    }
  });

  it('CAT-05: every side-navigation item resolves to a page, never to "not found"', () => {
    for (const item of allItems) {
      const { handle, params } = resolve(navItemHref(item));
      if (item.target === 'service') {
        const service = servicesFile.services.find((entry) => entry.id === item.serviceId);
        if (service?.kind === 'simulated') expect(handle.page).toBe('console');
        else {
          expect(handle.page, item.label).toBe('reference');
          expect(params.serviceId).toBe(item.serviceId);
        }
      } else {
        expect(handle, item.label).toMatchObject({
          page: 'console',
          consolePage: { path: item.route },
        });
      }
    }
  });

  it('CAT-05: console page paths are unique across consoles', () => {
    const paths = consolePages().map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('opens simulated services in their console and every other service on its reference page', () => {
    for (const service of servicesFile.services) {
      const { handle, params } = resolve(serviceHref(service));
      if (service.kind === 'simulated') {
        expect(handle, service.id).toMatchObject({
          page: 'console',
          consolePage: { serviceId: service.id, kind: 'functional' },
        });
      } else {
        expect(handle.page, service.id).toBe('reference');
        expect(params.serviceId).toBe(service.id);
      }
    }
  });

  it('resolves Console Home and unknown addresses', () => {
    expect(resolve('/').handle.page).toBe('home');
    expect(resolve('/not-a-page').handle.page).toBe('not-found');
    expect(resolve('/vpc/not-a-page').handle.page).toBe('not-found');
  });
});
