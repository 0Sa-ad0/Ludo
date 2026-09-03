const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

test('lobby shows the hex-board hint once 5+ players is selected', async ({ page }) => {
  await page.goto('/');
  await clickUntil(page, page.locator('#btn-create-room'), page.locator('#input-create-name'));
  await page.locator('#btn-player-count-5').click();
  await expect(page.getByText(/Hexagonal board will be used for 5 players/i)).toBeVisible();
});

test('a 5-player room actually renders the hex board once full', async ({ browser }) => {
  const contexts = [];
  const pages = [];

  const hostCtx = await browser.newContext();
  contexts.push(hostCtx);
  const host = await hostCtx.newPage();
  pages.push(host);

  await host.goto('/');
  await clickUntil(host, host.locator('#btn-create-room'), host.locator('#input-create-name'));
  await host.locator('#input-create-name').fill('P1');
  await host.locator('#btn-player-count-5').click();
  await host.locator('#btn-create-confirm').click();
  const roomCode = (await host.getByTestId('room-code').textContent()).trim();

  // Four more players join to fill the room.
  for (let i = 2; i <= 5; i++) {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const p = await ctx.newPage();
    pages.push(p);
    await p.goto('/');
    await clickUntil(p, p.locator('#btn-join-room'), p.locator('#input-join-name'));
    await p.locator('#input-join-name').fill(`P${i}`);
    await p.locator('#input-room-code').fill(roomCode);
    await p.locator('#btn-join-confirm').click();
  }

  // Room is full -> auto-starts -> hex board (not the square board) renders
  // for every player.
  for (const p of pages) {
    await expect(p.getByRole('img', { name: 'Hexagonal Ludo board' })).toBeVisible({ timeout: 10_000 });
  }

  for (const ctx of contexts) await ctx.close();
});
