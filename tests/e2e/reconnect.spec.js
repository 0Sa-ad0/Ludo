const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

// Test server runs with RECONNECT_GRACE_MS=4000 (see playwright.config.js)
// so these run in seconds instead of the real 30s production value.
const GRACE_MS = 4000;

async function createTwoPlayerGame(browser) {
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await host.goto('/');
  await clickUntil(host, host.locator('#btn-create-room'), host.locator('#input-create-name'));
  await host.locator('#input-create-name').fill('Host');
  await host.locator('#btn-player-count-2').click();
  await host.locator('#btn-create-confirm').click();
  const roomCode = (await host.getByTestId('room-code').textContent()).trim();

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto('/');
  await clickUntil(guest, guest.locator('#btn-join-room'), guest.locator('#input-join-name'));
  await guest.locator('#input-join-name').fill('Guest');
  await guest.locator('#input-room-code').fill(roomCode);
  await guest.locator('#btn-join-confirm').click();

  await expect(host.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });
  await expect(guest.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });

  return { hostCtx, host, guestCtx, guest, roomCode };
}

// Closes a context if it isn't already closed — safe to call even when the
// test already closed it manually mid-run.
async function safeClose(ctx) {
  try { await ctx.close(); } catch { /* already closed */ }
}

// Note: the actual guarantee that reconnecting-in-time cancels the pending
// AUTO flip is covered by tests/integration/reconnect.test.js, which talks
// to the server directly over sockets. That's the right layer for a
// server-side timer-bookkeeping regression — routing it through the full
// browser UI adds several seconds of unrelated, high-variance latency (dev
// compile, React Strict Mode's dev-only double-connect, click retries) that
// have nothing to do with what's being verified. These tests instead cover
// what the browser layer actually owns: surfacing the right toast at the
// right time (the persistent per-player side-panel badge these used to
// check was removed — it duplicated the player's name, which now renders
// once, directly on the board).
test.describe('Disconnect / reconnect / AUTO mode (UI)', () => {
  test('a disconnected player triggers a toast, then an AUTO toast after the grace period', async ({ browser }) => {
    const { hostCtx, host, guestCtx } = await createTwoPlayerGame(browser);

    // Guest disconnects (closing the context tears down the socket).
    await guestCtx.close();

    await expect(host.getByTestId('capture-banner')).toHaveText(/lost connection/i, { timeout: 3000 });

    // After the grace period, an AUTO toast follows.
    await expect(host.getByTestId('capture-banner')).toHaveText(/on auto/i, { timeout: GRACE_MS + 3000 });

    await safeClose(hostCtx);
  });

  test('a reconnected player triggers a welcome-back toast', async ({ browser }) => {
    const { hostCtx, host, guestCtx, roomCode } = await createTwoPlayerGame(browser);

    await guestCtx.close();
    await expect(host.getByTestId('capture-banner')).toHaveText(/lost connection/i, { timeout: 3000 });

    const newGuestCtx = await browser.newContext();
    const newGuest = await newGuestCtx.newPage();
    await newGuest.goto('/');
    await clickUntil(newGuest, newGuest.locator('#btn-join-room'), newGuest.locator('#input-join-name'));
    await newGuest.locator('#input-join-name').fill('Guest');
    await newGuest.locator('#input-room-code').fill(roomCode);
    await newGuest.locator('#btn-join-confirm').click();

    await expect(newGuest.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });
    await expect(host.getByTestId('capture-banner')).toHaveText(/is back/i, { timeout: 5000 });

    await safeClose(hostCtx);
    await safeClose(newGuestCtx);
  });
});
