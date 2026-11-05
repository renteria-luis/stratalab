import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONSOLE_TEXT } from '../src/console/text';
import { en } from '../src/i18n/messages/en';
import { es } from '../src/i18n/messages/es';
import { FAKE_ACCOUNT_ID, FAKE_USER_NAME, PRODUCT_NAME } from '../src/product';
import { GlobalSearch } from '../src/shell/GlobalSearch';
import { ServicesMenu } from '../src/shell/ServicesMenu';
import { uiStore } from '../src/state/uiStore';
import { renderApp, renderInRouter } from './renderApp';

function renderServicesMenu() {
  const anchor = document.createElement('div');
  document.body.append(anchor);
  return renderInRouter(<ServicesMenu anchor={anchor} />);
}

describe('console shell', () => {
  it('SHELL: opens straight into Console Home with the banner, footer and fake account', async () => {
    renderApp('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: CONSOLE_TEXT['home.title'] }),
    ).toBeDefined();
    expect(screen.getByText(en['banner.text'])).toBeDefined();
    expect(screen.getByText(en['footer.trademark'])).toBeDefined();
    expect(screen.getAllByText(FAKE_USER_NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(FAKE_ACCOUNT_ID)).length).toBeGreaterThan(0);
    expect(document.title).toBe(`${CONSOLE_TEXT['home.title']} | ${PRODUCT_NAME}`);
  });

  it('SHELL: no AWS branding in the product identity', () => {
    renderApp('/');
    expect(PRODUCT_NAME).not.toMatch(/aws|amazon/i);
    expect(screen.queryByText(/AWS Management Console/i)).toBeNull();
    expect(
      screen.getByRole('img', { name: en['top.logoAlt'].replace('{product}', PRODUCT_NAME) }),
    ).toBeDefined();
  });

  it('SHELL: Console Home shows the four simulator widgets and no invented numbers', async () => {
    renderApp('/');
    for (const name of [
      CONSOLE_TEXT['home.recent.title'],
      en['home.labs.title'],
      en['home.health.title'],
      en['home.cost.title'],
    ]) {
      expect(await screen.findByRole('heading', { level: 2, name })).toBeDefined();
    }
    expect(screen.getByText(en['home.health.ok'])).toBeDefined();
    expect(screen.getByText(en['home.cost.empty'])).toBeDefined();
    expect(screen.queryByText(/\$\s?\d/)).toBeNull();
  });

  it('SHELL: Alt+S focuses the global search', async () => {
    renderInRouter(<GlobalSearch />);
    const search = await screen.findByRole('combobox', { name: CONSOLE_TEXT['search.ariaLabel'] });
    fireEvent.keyDown(window, { key: 'ß', code: 'KeyS', altKey: true });
    expect(document.activeElement).toBe(search);
  });

  it('SHELL: the services menu lists views and categories; Escape closes it and returns focus', async () => {
    renderServicesMenu();
    const trigger = await screen.findByRole('button', { name: CONSOLE_TEXT['menu.button'] });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: CONSOLE_TEXT['menu.dialogLabel'] });
    const views = within(dialog).getByRole('list', { name: CONSOLE_TEXT['menu.viewsLabel'] });
    expect(
      within(views).getByRole('button', { name: 'Recently visited' }).getAttribute('aria-current'),
    ).toBe('true');
    expect(within(dialog).getByText(CONSOLE_TEXT['menu.recent.empty'])).toBeDefined();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Security, Identity, & Compliance' }),
    );
    expect(within(dialog).getByRole('link', { name: 'Amazon Macie' })).toBeDefined();

    fireEvent.keyDown(within(dialog).getByRole('link', { name: 'Amazon Macie' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog', { name: CONSOLE_TEXT['menu.dialogLabel'] })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('SHELL: menu descriptions appear where the capture has them', async () => {
    renderServicesMenu();
    fireEvent.click(await screen.findByRole('button', { name: CONSOLE_TEXT['menu.button'] }));
    const dialog = screen.getByRole('dialog', { name: CONSOLE_TEXT['menu.dialogLabel'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Compute' }));
    expect(within(dialog).getByText('Virtual Servers in the Cloud')).toBeDefined();
  });

  it('SHELL: opening a service records it in Recently visited', async () => {
    renderApp('/reference/macie');
    await waitFor(() => {
      expect(uiStore.getState().recentServiceIds[0]).toBe('macie');
    });
  });

  it('SHELL: Spanish translates simulator text only; console text stays English', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: CONSOLE_TEXT['home.title'] });
    uiStore.getState().setLocale('es');
    const banner = await screen.findByText(es['banner.text']);
    expect(banner.closest('[lang]')?.getAttribute('lang')).toBe('es');
    expect(
      await screen.findByRole('heading', { level: 2, name: es['home.health.title'] }),
    ).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 1, name: CONSOLE_TEXT['home.title'] }),
    ).toBeDefined();
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('reproduced console', () => {
  it('SHELL: the VPC console shows its side navigation as captured', async () => {
    renderApp('/vpc');
    expect(await screen.findByRole('heading', { level: 1, name: 'VPC dashboard' })).toBeDefined();
    // The dashboard links to Subnets too; every such link opens the captured route.
    expect(
      screen.getAllByRole('link', { name: 'Subnets' }).map((link) => link.getAttribute('href')),
    ).toContain('/vpc/subnets');
    expect(screen.getByText('Filter by VPC')).toBeDefined();
    expect(screen.getByText('Virtual private cloud')).toBeDefined();
    // "New" on Domain verifications and Settings (capture-notes.md).
    expect(screen.getAllByText(CONSOLE_TEXT['nav.badgeNew'])).toHaveLength(2);
    // AWS Global View opens its reference page; external items keep the external mark.
    const globalView = screen.getByRole('link', { name: /AWS Global View/ });
    expect(globalView.getAttribute('href')).toBe('/reference/global-view');
    expect(globalView.getAttribute('target')).toBe('_blank');
  });

  it('SHELL: functional pages open their view; empty pages a neutral empty state', async () => {
    const { router } = renderApp('/vpc/subnets');
    expect(await screen.findByRole('heading', { level: 1, name: /Subnets/ })).toBeDefined();
    expect(await screen.findByText('No subnets')).toBeDefined();

    await router.navigate('/vpc/elastic-ips');
    expect(await screen.findByRole('heading', { level: 1, name: /Elastic IPs/ })).toBeDefined();
    expect(screen.getByText(CONSOLE_TEXT['empty.title'])).toBeDefined();
  });

  it('SHELL: unknown addresses show "Page not found"', async () => {
    renderApp('/vpc/not-a-page');
    expect(
      await screen.findByRole('heading', { level: 1, name: en['notFound.title'] }),
    ).toBeDefined();
  });
});
