import { expect, test } from '@playwright/test';
import { PRODUCT_NAME } from '../src/product';

test('SMOKE: the app opens straight into the workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(PRODUCT_NAME);
  await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();
});
