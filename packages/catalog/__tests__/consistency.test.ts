import { describe, expect, it } from 'vitest';
import { cards, consoleNavs, examScope, servicesFile } from '../src/data';
import type { ConsoleNav, ExamEntry, NavItem } from '../src/schema';

const services = servicesFile.services;
const serviceIds = new Set(services.map((service) => service.id));

const navItems = (nav: ConsoleNav): NavItem[] => [
  nav.header,
  ...nav.sections.flatMap((section) => section.items),
];

const examLists = [
  ['clf in scope', examScope.clf.inScope],
  ['clf out of scope', examScope.clf.outOfScope],
  ['saa in scope', examScope.saa.inScope],
  ['saa out of scope', examScope.saa.outOfScope],
] as const;
const allExamEntries: ExamEntry[] = examLists.flatMap(([, list]) => list.entries);

describe('ids and references', () => {
  it('CAT-02: service ids are unique', () => {
    expect(serviceIds.size).toBe(services.length);
  });

  it('CAT-02: service names are unique', () => {
    expect(new Set(services.map((service) => service.name)).size).toBe(services.length);
  });

  it('CAT-02: every serviceId in nav files exists', () => {
    for (const nav of Object.values(consoleNavs)) {
      expect(serviceIds).toContain(nav.serviceId);
      for (const item of navItems(nav)) {
        if (item.serviceId !== undefined) expect(serviceIds).toContain(item.serviceId);
      }
    }
  });

  it('CAT-02: every serviceId in exam entries exists', () => {
    for (const entry of allExamEntries) {
      for (const id of entry.serviceIds) expect(serviceIds, entry.name).toContain(id);
    }
  });

  it('CAT-02: every card belongs to an existing service', () => {
    for (const card of cards) {
      expect(serviceIds).toContain(card.serviceId);
      for (const other of [...card.en.notToConfuseWith, ...card.es.notToConfuseWith]) {
        expect(serviceIds).toContain(other.serviceId);
      }
    }
  });
});

describe('categories and capture dates', () => {
  const categories = servicesFile.menu.categories;

  it('CAT-03: every service category is a menu category', () => {
    for (const service of services) expect(categories, service.name).toContain(service.category);
  });

  it('CAT-03: every menu category has at least one service', () => {
    const used = new Set(services.map((service) => service.category));
    for (const category of categories) expect(used, category).toContain(category);
  });

  it('CAT-03: menu categories are unique', () => {
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('CAT-01: every service carries the capture date of its file', () => {
    for (const service of services) expect(service.capturedOn).toBe(servicesFile.capturedOn);
  });
});

describe('simulated services and nav routes', () => {
  const simulated = services.filter((service) => service.kind === 'simulated');

  it('CAT-04: every simulated service has a release, a nav file and a functional route', () => {
    expect(simulated.length).toBeGreaterThan(0);
    for (const service of simulated) {
      expect(service.release, service.id).toBeDefined();
      const nav = consoleNavs[service.id];
      expect(nav, service.id).toBeDefined();
      if (nav === undefined) continue;
      expect(navItems(nav).some((item) => item.target === 'functional')).toBe(true);
    }
  });

  it('CAT-04: only simulated services have functional nav items', () => {
    for (const nav of Object.values(consoleNavs)) {
      const kind = services.find((service) => service.id === nav.serviceId)?.kind;
      if (kind === 'simulated') continue;
      expect(navItems(nav).every((item) => item.target !== 'functional')).toBe(true);
    }
  });

  it('CAT-05: routes are unique within each console and stay under its prefix', () => {
    for (const nav of Object.values(consoleNavs)) {
      const routes = navItems(nav).flatMap((item) =>
        item.route === undefined ? [] : [item.route],
      );
      expect(new Set(routes).size, nav.serviceId).toBe(routes.length);
      for (const route of routes) expect(route).toMatch(new RegExp(`^/${nav.serviceId}(/|$)`));
    }
  });

  // CAT-05 "every functional route exists in the app" lives in apps/web/__tests__/routes.test.ts.
});

describe('cards', () => {
  it('CAT-06: every card service is reference or simulated, and every reference service has a card', () => {
    const withCard = new Set(cards.map((card) => card.serviceId));
    for (const card of cards) {
      const kind = services.find((service) => service.id === card.serviceId)?.kind;
      expect(kind === 'reference' || kind === 'simulated', card.serviceId).toBe(true);
    }
    for (const service of services.filter((s) => s.kind === 'reference')) {
      expect(withCard, service.id).toContain(service.id);
    }
  });
});

describe('exam scope', () => {
  const inScope = (list: { entries: readonly ExamEntry[] }) =>
    new Set(list.entries.flatMap((entry) => entry.serviceIds));

  it('CAT-09: exam flags in services.json match the in-scope lists', () => {
    const clf = inScope(examScope.clf.inScope);
    const saa = inScope(examScope.saa.inScope);
    for (const service of services) {
      expect(service.exam, service.id).toEqual({
        clf: clf.has(service.id),
        saa: saa.has(service.id),
      });
    }
  });

  it('CAT-09: a "category" entry lists exactly the services of one console category', () => {
    for (const entry of allExamEntries.filter((e) => e.match === 'category')) {
      const categories = new Set(
        entry.serviceIds.map((id) => services.find((service) => service.id === id)?.category),
      );
      expect(categories.size, entry.name).toBe(1);
      const [category] = [...categories];
      const all = services.filter((service) => service.category === category).map((s) => s.id);
      expect([...entry.serviceIds].sort()).toEqual(all.sort());
    }
  });

  it('CAT-09: entries are unique per category within each list', () => {
    // A name can repeat across categories: SAA-C03 lists Amazon Redshift in two.
    for (const [label, list] of examLists) {
      const names = list.entries.map((entry) => `${entry.category}/${entry.name}`);
      expect(new Set(names).size, label).toBe(names.length);
    }
  });
});
