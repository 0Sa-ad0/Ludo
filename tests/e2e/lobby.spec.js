const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

test.describe('Lobby / landing page', () => {
  test('shows the home screen with create/join/leaderboard options', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#btn-create-room')).toBeVisible();
    await expect(page.locator('#btn-join-room')).toBeVisible();
    await expect(page.locator('#btn-leaderboard')).toBeVisible();
  });

  test('Create Room button reveals the create form, Back returns home', async ({ page }) => {
    await page.goto('/');
    await clickUntil(page, page.locator('#btn-create-room'), page.locator('#input-create-name'));
    await expect(page.locator('#btn-create-confirm')).toBeVisible();

    await clickUntil(page, page.getByText('← Back'), page.locator('#btn-create-room'));
  });

  test('joining a room that does not exist shows an error', async ({ page }) => {
    await page.goto('/');
    await clickUntil(page, page.locator('#btn-join-room'), page.locator('#input-join-name'));
    await page.locator('#input-join-name').fill('Tester');
    await page.locator('#input-room-code').fill('ZZZZZZ');
    await page.locator('#btn-join-confirm').click();

    await expect(page.getByTestId('error-banner')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('error-banner')).toHaveText(/room not found/i);
  });
});
