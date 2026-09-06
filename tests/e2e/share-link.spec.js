const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

/**
 * REGRESSION: opening a shared /game/CODE link in a fresh browser had no
 * sessionStorage to read a name from, so the page emitted join_room with
 * playerName: undefined and the server happily seated a player called
 * "undefined". This broke the app's primary flow — the host shares that link
 * and everyone else arrives through it.
 *
 * The link must now ask for a name first.
 */
test.describe('Shared room link', () => {
  async function hostARoom(browser, { password = '' } = {}) {
    const ctx = await browser.newContext();
    const host = await ctx.newPage();
    await host.goto('/');
    await clickUntil(host, host.locator('#btn-create-room'), host.locator('#input-create-name'));
    await host.locator('#input-create-name').fill('Host');
    await host.locator('#btn-player-count-2').click();
    if (password) {
      await host.locator('#chk-password').check();
      await host.locator('#input-create-password').fill(password);
    }
    await host.locator('#btn-create-confirm').click();
    await expect(host.getByTestId('room-code')).toBeVisible({ timeout: 10_000 });
    const roomCode = (await host.getByTestId('room-code').textContent()).trim();
    return { ctx, host, roomCode };
  }

  test('opening the link directly asks for a name instead of joining as "undefined"', async ({ browser }) => {
    const { ctx: hostCtx, host, roomCode } = await hostARoom(browser);

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await guest.goto(`/game/${roomCode}`);

    // The prompt appears, and nobody has been seated yet.
    await expect(guest.locator('#join-prompt-name')).toBeVisible({ timeout: 10_000 });
    await expect(host.getByTestId('waiting-count')).toHaveText('1 / 2 joined');

    await guest.locator('#join-prompt-name').fill('LinkGuest');
    await guest.locator('#btn-join-prompt').click();

    // Room fills and auto-starts for both.
    await expect(guest.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });
    await expect(host.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });

    // The name that actually reached the server is the one that was typed.
    await expect(host.locator('#player-panel-1')).toContainText('LinkGuest');
    await expect(host.locator('#player-panel-1')).not.toContainText('undefined');

    await hostCtx.close();
    await guestCtx.close();
  });

  test('an empty name is rejected by the prompt', async ({ browser }) => {
    const { ctx: hostCtx, roomCode } = await hostARoom(browser);

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await guest.goto(`/game/${roomCode}`);
    await expect(guest.locator('#join-prompt-name')).toBeVisible({ timeout: 10_000 });

    await guest.locator('#join-prompt-name').fill('   ');
    await guest.locator('#btn-join-prompt').click();

    await expect(guest.getByText('Please enter a name')).toBeVisible();
    await expect(guest.locator('#join-prompt-name')).toBeVisible();

    await hostCtx.close();
    await guestCtx.close();
  });

  test('the prompt carries the room password through', async ({ browser }) => {
    const { ctx: hostCtx, roomCode } = await hostARoom(browser, { password: 'letmein' });

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await guest.goto(`/game/${roomCode}`);
    await expect(guest.locator('#join-prompt-name')).toBeVisible({ timeout: 10_000 });

    await guest.locator('#join-prompt-name').fill('PwGuest');
    await guest.locator('#join-prompt-password').fill('letmein');
    await guest.locator('#btn-join-prompt').click();

    await expect(guest.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });

    await hostCtx.close();
    await guestCtx.close();
  });
});
