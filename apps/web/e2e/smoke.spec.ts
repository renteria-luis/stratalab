import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CONSOLE_TEXT } from '../src/console/text';
import { en } from '../src/i18n/messages/en';
import { PRODUCT_NAME } from '../src/product';

async function expectNoWcagViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => `${node.target.join(' ')} ${node.failureSummary ?? ''}`).join(' | ')}`,
    ),
  ).toEqual([]);
}

test('SMOKE: the app opens straight into Console Home', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(`${CONSOLE_TEXT['home.title']} | ${PRODUCT_NAME}`);
  await expect(
    page.getByRole('heading', { level: 1, name: CONSOLE_TEXT['home.title'] }),
  ).toBeVisible();
  await expect(page.getByText(en['banner.text'])).toBeVisible();
  await expectNoWcagViolations(page);
});

test('SMOKE: Alt+S, search "macie", open it and see the reference notice', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: CONSOLE_TEXT['home.title'] }),
  ).toBeVisible();
  await page.keyboard.press('Alt+KeyS');
  const search = page.getByRole('combobox', { name: CONSOLE_TEXT['search.ariaLabel'] });
  await expect(search).toBeFocused();
  await search.pressSequentially('macie');
  await page.getByRole('option', { name: /Amazon Macie/ }).click();

  await expect(page).toHaveURL(/\/reference\/macie$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Amazon Macie' })).toBeVisible();
  await expect(page.getByText(en['reference.notice'])).toBeVisible();
  await expect(page.getByText(en['reference.noCard'])).toBeVisible();
  await expectNoWcagViolations(page);
});

test('SMOKE: the VPC console opens with its side navigation', async ({ page }) => {
  await page.goto('/vpc/subnets');
  await expect(page.getByRole('heading', { level: 1, name: 'Subnets' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Route tables', exact: true })).toBeVisible();
  await expectNoWcagViolations(page);
});
