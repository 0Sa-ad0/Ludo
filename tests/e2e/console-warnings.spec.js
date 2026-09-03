const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

/**
 * Regression test: the game page used to destructure `params.roomId`
 * directly, but Next.js 15+ makes route `params` a Promise for Client
 * Components — accessing it synchronously logs a "sync-dynamic-apis"
 * console warning on every render. Fixed by unwrapping with React's `use()`.
 *
 * Also guards against any uncaught runtime exception during the core
 * create-room -> waiting-room flow, regardless of cause.
 */
test('REGRESSION: no params.roomId Promise warning, no uncaught page errors', async ({ page }) => {
  const consoleWarnings = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (['warning', 'error'].includes(msg.type())) consoleWarnings.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');
  await clickUntil(page, page.locator('#btn-create-room'), page.locator('#input-create-name'));
  await page.locator('#input-create-name').fill('Host');
  await page.locator('#btn-player-count-2').click();
  await page.locator('#btn-create-confirm').click();
  await expect(page.getByTestId('room-code')).toBeVisible({ timeout: 10_000 });

  const paramsWarning = consoleWarnings.find((w) =>
    /params.*Promise|sync-dynamic-apis|accessed directly with `params/i.test(w)
  );
  expect(paramsWarning, `Found params-Promise warning: ${paramsWarning}`).toBeUndefined();
  expect(pageErrors, `Uncaught page errors: ${pageErrors.join(', ')}`).toEqual([]);
});
