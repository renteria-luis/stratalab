import { expect, test } from '@playwright/test';
import { expectNoWcagViolations } from './a11y';
import { en } from '../src/i18n/messages/en';

test('NAT-01: create a NAT gateway with "Allocate Elastic IP" and pick it in Edit routes', async ({
  page,
}) => {
  // Lab 1 gives a VPC with an attached internet gateway (NAT-07).
  await page.goto('/labs');
  await page.getByRole('button', { name: en['labs.start'] }).click();

  await page.goto('/vpc/nat-gateways');
  await expect(page.getByRole('heading', { level: 1, name: /NAT gateways/ })).toBeVisible();
  await expect(page.getByText('No NAT gateways found')).toBeVisible();
  await expectNoWcagViolations(page);

  await page.getByRole('button', { name: 'Create NAT gateway' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create NAT gateway' })).toBeVisible();
  await page.getByRole('button', { name: /Select a subnet/ }).click();
  await page.getByRole('option', { name: /subnet-0000000a/ }).click();
  await page.getByRole('button', { name: 'Allocate Elastic IP' }).click();
  await expect(page.getByRole('button', { name: /203\.0\.113\./ })).toBeVisible();
  await expectNoWcagViolations(page);
  await page.getByRole('button', { name: 'Create NAT gateway' }).click();

  await expect(page).toHaveURL(/\/vpc\/nat-gateways$/);
  await expect(page.getByRole('gridcell', { name: 'Available' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /^nat-/ })).toBeVisible();

  await page.goto('/vpc/route-tables/rtb-00000002/edit-routes');
  await page.getByRole('button', { name: 'Add route' }).click();
  await page.getByRole('combobox', { name: 'Destination' }).last().fill('0.0.0.0/0');
  await page.getByRole('button', { name: 'Target type' }).last().click();
  await page.getByRole('option', { name: 'NAT Gateway' }).click();
  const target = page.getByRole('combobox', { name: 'Target' }).last();
  await expect(target).toHaveValue('nat-');
  await target.click();
  await expect(page.getByRole('option', { name: /^nat-[0-9a-f]+$/ })).toBeVisible();
  await expectNoWcagViolations(page);
});
