import { expect, type Locator } from '@playwright/test';

export async function expectFooterPagination(pagers: Locator, results: Locator) {
  await expect(pagers).toHaveCount(1);
  await expect(pagers).toBeVisible();
  await expect(results).toBeVisible();
  const [pager, collection] = await Promise.all([pagers.boundingBox(), results.boundingBox()]);
  expect(pager).not.toBeNull();
  expect(collection).not.toBeNull();
  expect(pager!.y).toBeGreaterThanOrEqual(collection!.y + collection!.height - 1);
}
