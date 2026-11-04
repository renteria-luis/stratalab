import { describe, expect, it } from 'vitest';
import { servicesFile } from '../src/data';
import type { Service } from '../src/schema';
import {
  buildSearchIndex,
  menuCategories,
  normalizeSearchText,
  searchServices,
  shortForm,
} from '../src/search';

const services = servicesFile.services;
const index = buildSearchIndex(services);
const ids = (results: readonly Service[]) => results.map((service) => service.id);

describe('search finds every service', () => {
  it('CAT-08: the exact name returns the service first', () => {
    for (const service of services) {
      expect(searchServices(index, service.name)[0]?.id, service.name).toBe(service.id);
    }
  });

  it('CAT-08: the short name (without "Amazon" or "AWS") returns the service first', () => {
    for (const service of services) {
      expect(searchServices(index, shortForm(service.name))[0]?.id, service.name).toBe(service.id);
    }
  });

  it('CAT-08: every alias finds the service', () => {
    for (const service of services) {
      for (const alias of service.aliases) {
        expect(ids(searchServices(index, alias)), alias).toContain(service.id);
      }
    }
  });

  it('CAT-08: short names are unique, so a name never points to two services', () => {
    const shortNames = services.map((service) => shortForm(service.name));
    expect(new Set(shortNames).size).toBe(shortNames.length);
  });

  it('CAT-08: no alias equals another service name', () => {
    const owner = new Map(services.map((service) => [shortForm(service.name), service.id]));
    for (const service of services) {
      for (const alias of service.aliases) {
        const other = owner.get(shortForm(alias));
        expect(other === undefined || other === service.id, `${service.id}: ${alias}`).toBe(true);
      }
    }
  });

  it('CAT-08: matching ignores case, punctuation, "&" vs "and" and the Amazon/AWS prefix', () => {
    expect(ids(searchServices(index, 'amazon ec2'))[0]).toBe('ec2');
    expect(ids(searchServices(index, 'Resource Groups and Tag Editor'))[0]).toBe(
      'resource-groups-and-tag-editor',
    );
    expect(ids(searchServices(index, 'x ray'))[0]).toBe('x-ray');
    expect(normalizeSearchText('  WAF & Shield  ')).toBe('waf and shield');
  });

  it('CAT-08: a prefix finds the service', () => {
    expect(ids(searchServices(index, 'Elastic Compute'))).toContain('ec2');
    expect(ids(searchServices(index, 'guard'))).toContain('guardduty');
  });

  it('CAT-08: an empty, blank or punctuation-only query returns nothing', () => {
    expect(searchServices(index, '')).toEqual([]);
    expect(searchServices(index, '  -/.  ')).toEqual([]);
  });
});

describe('search is stable', () => {
  it('CAT-08: the same query returns the same results', () => {
    for (const query of ['s3', 'amazon', 'connect', 'gateway', 'manager']) {
      expect(ids(searchServices(index, query))).toEqual(ids(searchServices(index, query)));
    }
  });

  it('CAT-08: results do not depend on the input order of the services', () => {
    const reversed = buildSearchIndex([...services].reverse());
    for (const query of ['s3', 'amazon', 'connect', 'gateway', 'manager', 'iot']) {
      expect(ids(searchServices(reversed, query))).toEqual(ids(searchServices(index, query)));
    }
  });

  it('CAT-08: a limit keeps the first results', () => {
    const all = ids(searchServices(index, 'amazon'));
    expect(ids(searchServices(index, 'amazon', 3))).toEqual(all.slice(0, 3));
  });
});

describe('retired services', () => {
  const first = services[0];
  if (first === undefined) throw new Error('services.json is empty');
  const retired: Service = { ...first, retired: true };
  const withRetired = [retired, ...services.slice(1)];

  it('CAT-07: a retired service never appears in search results', () => {
    const retiredIndex = buildSearchIndex(withRetired);
    expect(ids(searchServices(retiredIndex, retired.name))).not.toContain(retired.id);
    for (const alias of retired.aliases) {
      expect(ids(searchServices(retiredIndex, alias))).not.toContain(retired.id);
    }
  });

  it('CAT-07: a retired service never appears in the menu', () => {
    const menu = menuCategories({ menu: servicesFile.menu, services: withRetired });
    const listed = menu.flatMap((group) => ids(group.services));
    expect(listed).not.toContain(retired.id);
    expect(listed).toHaveLength(services.length - 1);
  });
});

describe('menu', () => {
  it('CAT-03: categories come in menu order and services keep the All services page order', () => {
    const menu = menuCategories(servicesFile);
    expect(menu.map((group) => group.category)).toEqual(servicesFile.menu.categories);
    for (const group of menu) {
      expect(ids(group.services)).toEqual(
        ids(services.filter((service) => service.category === group.category)),
      );
    }
  });
});
