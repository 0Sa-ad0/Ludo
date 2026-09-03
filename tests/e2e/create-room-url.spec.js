const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

/**
 * Regression test: creating a room used to leave the browser's address bar
 * stuck on /game/create forever. A refresh there re-ran create_room instead
 * of rejoining, silently abandoning the player's existing seat and spinning
 * up a brand-new room. Fixed by swapping the URL to /game/{roomCode} via
 * history.replaceState once the server assigns a real code.
 */
test('REGRESSION: address bar updates from /game/create to the real room code', async ({ page }) => {
  await page.goto('/');
  await clickUntil(page, page.locator('#btn-create-room'), page.locator('#input-create-name'));
  await page.locator('#input-create-name').fill('Host');
  await page.locator('#btn-player-count-2').click();
  await page.locator('#btn-create-confirm').click();

  await expect(page.getByTestId('room-code')).toBeVisible({ timeout: 10_000 });
  const roomCode = (await page.getByTestId('room-code').textContent()).trim();

  await expect(page).toHaveURL(new RegExp(`/game/${roomCode}$`));
  expect(page.url()).not.toContain('/game/create');
});
