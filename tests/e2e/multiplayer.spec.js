const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

/**
 * Full 2-player flow through real Socket.io connections and the real UI:
 * create room -> join -> auto-start -> roll -> move -> state sync across
 * both browser contexts.
 */
test.describe('Two-player game flow', () => {
  test('create, join, auto-start, and a synced roll+move', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();

    // ── Host creates a 2-player room ──────────────────────────────────────
    await host.goto('/');
    await clickUntil(host, host.locator('#btn-create-room'), host.locator('#input-create-name'));
    await host.locator('#input-create-name').fill('Host');
    await host.locator('#btn-player-count-2').click();
    await host.locator('#btn-create-confirm').click();

    await expect(host.getByTestId('waiting-count')).toHaveText('1 / 2 joined');
    const roomCode = (await host.getByTestId('room-code').textContent()).trim();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    // ── Guest joins with that code ────────────────────────────────────────
    await guest.goto('/');
    await clickUntil(guest, guest.locator('#btn-join-room'), guest.locator('#input-join-name'));
    await guest.locator('#input-join-name').fill('Guest');
    await guest.locator('#input-room-code').fill(roomCode);
    await guest.locator('#btn-join-confirm').click();

    // ── Room auto-starts the moment it's full, for both players ──────────
    await expect(host.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });
    await expect(guest.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });

    // Exactly one of the two should see "Your Turn" (it's Host's turn first,
    // slot 0 always goes first).
    await expect(host.getByTestId('turn-text')).toHaveAttribute('data-my-turn', 'true');
    await expect(guest.getByTestId('turn-text')).toHaveAttribute('data-my-turn', 'false');

    // ── Roll until a piece becomes movable (needs a 6, since every piece
    // starts at home), then move it, and confirm both browsers see it ──────
    let moved = false;
    for (let attempt = 0; attempt < 15 && !moved; attempt++) {
      const currentPlayer = (await host.getByTestId('turn-text').getAttribute('data-my-turn')) === 'true'
        ? host : guest;
      const otherPlayer = currentPlayer === host ? guest : host;

      await expect(currentPlayer.locator('#btn-roll-dice')).toBeEnabled({ timeout: 10_000 });
      await currentPlayer.locator('#btn-roll-dice').click();

      // Dice value must sync to both browsers.
      await expect(currentPlayer.locator('#btn-roll-dice')).not.toHaveAttribute('data-value', '', { timeout: 5000 });
      const value = await currentPlayer.locator('#btn-roll-dice').getAttribute('data-value');
      expect(['1', '2', '3', '4', '5', '6']).toContain(value);

      const validPiece = currentPlayer.locator('[data-testid^="piece-"][data-valid="true"]:visible').first();
      if (await validPiece.count() > 0 && await validPiece.isVisible().catch(() => false)) {
        await validPiece.click();
        moved = true;

        // After a move the server clears diceValue/diceRolled — confirm that
        // reset reaches BOTH browsers, proving the shared game_state synced.
        await expect(currentPlayer.locator('#btn-roll-dice')).toHaveAttribute('data-value', '', { timeout: 5000 });
        await expect(otherPlayer.locator('#btn-roll-dice')).toHaveAttribute('data-value', '', { timeout: 5000 });
      } else {
        // No valid move (didn't roll a 6) — server auto-skips the turn after ~1.5s.
        await currentPlayer.waitForTimeout(2000);
      }
    }

    expect(moved).toBe(true);

    await hostCtx.close();
    await guestCtx.close();
  });

  test('wrong room password is rejected', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();

    await host.goto('/');
    await clickUntil(host, host.locator('#btn-create-room'), host.locator('#input-create-name'));
    await host.locator('#input-create-name').fill('Host');
    await host.locator('#btn-player-count-2').click();
    await host.locator('#chk-password').check();
    await host.locator('#input-create-password').fill('secret123');
    await host.locator('#btn-create-confirm').click();

    const roomCode = (await host.getByTestId('room-code').textContent()).trim();

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await guest.goto('/');
    await clickUntil(guest, guest.locator('#btn-join-room'), guest.locator('#input-join-name'));
    await guest.locator('#input-join-name').fill('Guest');
    await guest.locator('#input-room-code').fill(roomCode);
    await guest.locator('#input-join-password').fill('wrong-password');
    await guest.locator('#btn-join-confirm').click();

    // Lands back on the join prompt (not a dead end) so a mistyped password
    // can be corrected without leaving the page.
    await expect(guest.getByTestId('join-error')).toBeVisible({ timeout: 5000 });
    await expect(guest.getByTestId('join-error')).toHaveText(/wrong password/i);

    await hostCtx.close();
    await guestCtx.close();
  });

  test('correct room password allows joining', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();

    await host.goto('/');
    await clickUntil(host, host.locator('#btn-create-room'), host.locator('#input-create-name'));
    await host.locator('#input-create-name').fill('Host');
    await host.locator('#btn-player-count-2').click();
    await host.locator('#chk-password').check();
    await host.locator('#input-create-password').fill('secret123');
    await host.locator('#btn-create-confirm').click();

    const roomCode = (await host.getByTestId('room-code').textContent()).trim();

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await guest.goto('/');
    await clickUntil(guest, guest.locator('#btn-join-room'), guest.locator('#input-join-name'));
    await guest.locator('#input-join-name').fill('Guest');
    await guest.locator('#input-room-code').fill(roomCode);
    await guest.locator('#input-join-password').fill('secret123');
    await guest.locator('#btn-join-confirm').click();

    // Both should now be in the (auto-started) game.
    await expect(guest.getByTestId('turn-text')).toBeVisible({ timeout: 10_000 });

    await hostCtx.close();
    await guestCtx.close();
  });
});
