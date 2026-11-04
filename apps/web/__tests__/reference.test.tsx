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
