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

    // A rejected join attempt lands back on the name/password prompt (not a
    // dead end) so a recoverable mistake — e.g. a taken name or wrong
    // password — can be fixed and retried without leaving the page.
    await expect(page.getByTestId('join-error')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('join-error')).toHaveText(/room not found/i);
  });

  test('joining with a name already taken in the room shows an error and lets you retry', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await host.goto('/');
    await clickUntil(host, host.locator('#btn-create-room'), host.locator('#input-create-name'));
    await host.locator('#input-create-name').fill('Ann');
    await host.locator('#btn-player-count-4').click();
    await host.locator('#btn-create-confirm').click();
    const roomCode = (await host.getByTestId('room-code').textContent()).trim();

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await guest.goto(`/game/${roomCode}`);
    await guest.locator('#join-prompt-name').fill('Ann');
    await guest.locator('#btn-join-prompt').click();

    // REGRESSION: this used to strand the player on a dead-end error screen
    // with no way to pick a different name and get into the room.
    await expect(guest.getByTestId('join-error')).toBeVisible({ timeout: 5000 });
    await expect(guest.getByTestId('join-error')).toHaveText(/already taken/i);
    await expect(guest.locator('#join-prompt-name')).toBeVisible();

    await guest.locator('#join-prompt-name').fill('Bob');
    await guest.locator('#btn-join-prompt').click();
    await expect(guest.getByTestId('room-code')).toHaveText(roomCode, { timeout: 5000 });

    await hostCtx.close();
    await guestCtx.close();
  });
});
