import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { lab01 } from '@sim/labs';
import { en } from '../src/i18n/messages/en';

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

async function openWorkbenchTab(page: Page, tab: string) {
  const openButton = page.getByRole('button', { name: en['workbench.open'] });
  if (await openButton.isVisible()) await openButton.click();
  await page.getByRole('tab', { name: tab }).click();
}

async function selectRow(page: Page, id: string) {
  await page.getByRole('checkbox', { name: id, exact: true }).check();
}

async function action(page: Page, item: string) {
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('LAB: complete lab 1 "Web server not reachable" end to end', async ({ page }) => {
  await page.goto('/labs');
  await page.getByRole('button', { name: en['labs.start'] }).click();
  await expect(page.getByText(lab01.story.en)).toBeVisible();

  // The site doesn't load, and the trace shows where it stops.
  await page.getByRole('button', { name: en['browser.go'] }).click();
  await expect(page.getByText(en['browser.cantReach'])).toBeVisible();
  await page.getByRole('button', { name: en['browser.traceIt'] }).click();
  await page.getByRole('button', { name: en['trace.run'] }).click();
  await expect(page.getByText(en['verdict.ROUTED_THEN_DROPPED'], { exact: false })).toBeVisible();

  await page.getByRole('tab', { name: en['workbench.tab.diagram'] }).click();
  const diagram = page.getByRole('region', { name: en['diagram.label'] });
  await expect(diagram.getByText('web-1')).toBeVisible();
  await expect(diagram.getByText(en['diagram.stoppedHere'])).toBeVisible();

  // Fix 1: the web security group serves HTTP, not HTTPS.
  await page.goto('/vpc/security-groups');
  await selectRow(page, 'sg-0000000a');
  await action(page, 'Edit inbound rules');
  await expect(page.getByRole('heading', { level: 1, name: 'Edit inbound rules' })).toBeVisible();
  await page.getByRole('button', { name: /HTTPS/ }).click();
  await page.getByRole('option', { name: 'HTTP', exact: true }).click();
  await page.getByRole('button', { name: 'Save rules' }).click();
  await expect(page).toHaveURL(/\/vpc\/security-groups$/);

  // Fix 2: public-a uses public-rt, which routes 0.0.0.0/0 to the internet gateway.
  await page.goto('/vpc/route-tables');
  await selectRow(page, 'rtb-00000002');
  await action(page, 'Edit subnet associations');
  await selectRow(page, 'subnet-0000000a');
  await page.getByRole('button', { name: 'Save associations' }).click();
  await expect(page).toHaveURL(/\/vpc\/route-tables$/);

  // The page loads in the sandboxed virtual browser.
  await openWorkbenchTab(page, en['workbench.tab.browser']);
  await page.getByRole('textbox', { name: en['browser.address'] }).fill(lab01.browserUrl);
  await page.getByRole('button', { name: en['browser.go'] }).click();
  const frame = page.getByTitle('Page served by web-1');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(
    page
      .frameLocator('iframe[title="Page served by web-1"]')
      .getByRole('heading', { name: 'It works' }),
  ).toBeVisible();

  await page.getByRole('button', { name: en['lab.check'] }).click();
  await expect(page.getByText(en['lab.complete'])).toBeVisible();
  await expect(page.getByText(en['lab.review'])).toBeVisible();
  // axe can't enter the sandboxed iframe (no scripts allowed there), so check the page with
  // the diagram tab open instead.
  await page.getByRole('tab', { name: en['workbench.tab.diagram'] }).click();
  await expect(page.getByRole('region', { name: en['diagram.label'] })).toBeVisible();
  await expectNoWcagViolations(page);
});
