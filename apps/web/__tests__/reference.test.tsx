import { cards } from '@sim/catalog';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/messages/en';
import { renderApp } from './renderApp';

describe('ServiceReferenceView', () => {
  it('SHELL: a nav-only service with docsUrl shows the notice, "No card yet" and the docs link', async () => {
    renderApp('/reference/macie');
    expect(await screen.findByRole('heading', { level: 1, name: 'Amazon Macie' })).toBeDefined();
    expect(screen.getByText(en['reference.notice'])).toBeDefined();
    expect(screen.getByText(en['reference.noCard'])).toBeDefined();
    const docs = screen.getByRole('link', { name: new RegExp(en['reference.docsLink']) });
    expect(docs.getAttribute('href')).toBe('https://docs.aws.amazon.com/macie/');
  });

  it('SHELL: a nav-only service without docsUrl shows no docs link', async () => {
    renderApp('/reference/global-view');
    expect(await screen.findByRole('heading', { level: 1, name: 'AWS Global View' })).toBeDefined();
    expect(screen.getByText(en['reference.noCard'])).toBeDefined();
    expect(screen.queryByRole('link', { name: new RegExp(en['reference.docsLink']) })).toBeNull();
  });

  it('SHELL: a reference service shows the notice and its card with sources, without "No card yet"', async () => {
    const card = cards.find((entry) => entry.serviceId === 'route-53');
    if (card === undefined) throw new Error('route-53 card missing');
    renderApp('/reference/route-53');
    expect(await screen.findByRole('heading', { level: 1, name: 'Route 53' })).toBeDefined();
    expect(screen.getByText(en['reference.notice'])).toBeDefined();
    expect(screen.queryByText(en['reference.noCard'])).toBeNull();
    expect(screen.getByRole('heading', { name: en['reference.card'] })).toBeDefined();
    expect(screen.getByText(card.en.summary)).toBeDefined();
    for (const source of card.sources) {
      const title = source.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(screen.getByRole('link', { name: new RegExp(title) })).toBeDefined();
    }
  });

  it('SHELL: a simulated service links to its console', async () => {
    renderApp('/reference/vpc');
    expect(await screen.findByText(en['reference.simulatedNotice'])).toBeDefined();
    const link = screen.getByRole('link', {
      name: en['reference.openConsole'].replace('{name}', 'VPC'),
    });
    expect(link.getAttribute('href')).toBe('/vpc');
  });

  it('SHELL: an unknown service id shows "Page not found"', async () => {
    renderApp('/reference/not-a-service');
    expect(
      await screen.findByRole('heading', { level: 1, name: en['notFound.title'] }),
    ).toBeDefined();
  });
});
