import { servicesFile } from '@sim/catalog';
import { describe, expect, it } from 'vitest';
import { applyLayout, toLayout, WIDGET_IDS } from '../src/pages/home/layout';
import {
  CATEGORY_ICONS,
  VIEW_BEHAVIORS,
  isFocusSearchShortcut,
  listedServices,
  menuViews,
} from '../src/shell/menuData';

describe('services menu data', () => {
  it('SHELL: every captured menu view has a behavior, in captured order', () => {
    for (const view of servicesFile.menu.views) expect(VIEW_BEHAVIORS, view).toHaveProperty([view]);
    expect(menuViews.map((view) => view.name)).toEqual(servicesFile.menu.views);
  });

  it('SHELL: every captured category has one of our generic icons', () => {
    for (const category of servicesFile.menu.categories) {
      expect(CATEGORY_ICONS, category).toHaveProperty([category]);
    }
  });

  it('CAT-07: the "All services" view leaves out retired services', () => {
    expect(listedServices.some((service) => service.retired === true)).toBe(false);
  });

  it('SHELL: Alt+S (Option+S) focuses search; other combinations do not', () => {
    const base = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, code: 'KeyS' };
    expect(isFocusSearchShortcut({ ...base, altKey: true })).toBe(true);
    expect(isFocusSearchShortcut(base)).toBe(false);
    expect(isFocusSearchShortcut({ ...base, altKey: true, ctrlKey: true })).toBe(false);
    expect(isFocusSearchShortcut({ ...base, altKey: true, code: 'KeyD' })).toBe(false);
  });
});

describe('Console Home layout', () => {
  it('SHELL: keeps the stored order, drops unknown widgets and appends missing ones', () => {
    const items = applyLayout([
      { id: 'estimated-cost', columnSpan: 4 },
      { id: 'unknown-widget' },
      { id: 'estimated-cost' },
    ]);
    expect(items.map((item) => item.id)).toEqual([
      'estimated-cost',
      ...WIDGET_IDS.filter((id) => id !== 'estimated-cost'),
    ]);
    const [first] = items;
    expect(first && toLayout(first)).toEqual({ id: 'estimated-cost', columnSpan: 4 });
  });

  it('SHELL: with no stored layout, shows every widget in default order', () => {
    expect(applyLayout(null).map((item) => item.id)).toEqual([...WIDGET_IDS]);
  });
});
