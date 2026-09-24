const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

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

// Note: the deeper server-side timer bookkeeping (reconnect cycles, seat
// ownership races) is covered by tests/integration/reconnect.test.js, which
// talks to the server directly over sockets — the right layer for that,
// since routing it through the full browser UI adds several seconds of
// unrelated, high-variance latency (dev compile, React Strict Mode's
// dev-only double-connect, click retries) that have nothing to do with what
// it's verifying. These tests instead cover what the browser layer actually
// owns: surfacing the right toast (the persistent per-player side-panel
// badge these used to check was removed — it duplicated the player's name,
// which now renders once, directly on the board).
test.describe('Disconnect / reconnect / AUTO mode (UI)', () => {
  test('a disconnected player triggers a toast, and the game just waits — no AUTO takeover', async ({ browser }) => {
    const { hostCtx, host, guestCtx } = await createTwoPlayerGame(browser);

    // Guest disconnects (closing the context tears down the socket).
    await guestCtx.close();

    await expect(host.getByTestId('capture-banner')).toHaveText(/lost connection/i, { timeout: 3000 });

    // A disconnect mid-game must never hand the seat to AUTO on its own —
    // the game waits, however long it takes, for the real person. Confirm no
    // "on AUTO" toast ever follows, well past what the old grace period used
    // to be.
    //
    // Polled continuously rather than sampled once at the end: the toast is
    // ephemeral (TOAST_MS = 3.2s), so an "on AUTO" toast could appear and
    // auto-dismiss entirely within this window — a single check at t=5s
    // would silently miss it. banner.count() guards against the locator
    // matching zero elements, which is the expected steady state once the
    // earlier "lost connection" toast has itself dismissed.
    const banner = host.getByTestId('capture-banner');
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const text = (await banner.count()) > 0 ? await banner.textContent() : '';
      expect(text || '').not.toMatch(/on auto/i);
      await host.waitForTimeout(200);
    }

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
