const { test, expect } = require('@playwright/test');
const { clickUntil } = require('./helpers');

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function createRoom(browser, { name, count, teams = false, ctxOptions = {} }) {
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  await page.goto('/');
  await clickUntil(page, page.locator('#btn-create-room'), page.locator('#input-create-name'));
  await page.locator('#input-create-name').fill(name);
  await page.locator(`#btn-player-count-${count}`).click();
  if (teams) await page.locator('#chk-teams').check();
  await page.locator('#btn-create-confirm').click();
  const roomCode = (await page.getByTestId('room-code').textContent()).trim();
  return { ctx, page, roomCode };
}

async function joinRoom(browser, { name, roomCode, ctxOptions = {} }) {
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  await page.goto('/');
  await clickUntil(page, page.locator('#btn-join-room'), page.locator('#input-join-name'));
  await page.locator('#input-join-name').fill(name);
  await page.locator('#input-room-code').fill(roomCode);
  await page.locator('#btn-join-confirm').click();
  return { ctx, page };
}

/** True when the element's text isn't being cut off. */
const notClipped = (locator) => locator.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);

test.describe('2v2 teams', () => {
  test('pick a team in the lobby, then the game shows both teams', async ({ browser }) => {
    test.setTimeout(90_000);
    const host = await createRoom(browser, { name: 'Host', count: 4, teams: true });
    await expect(host.page.getByTestId('team-group-0')).toContainText('Host');

    const a = await joinRoom(browser, { name: 'Ana', roomCode: host.roomCode });
    // Host took Team A, so the first joiner is put on Team B…
    await expect(host.page.getByTestId('team-group-1')).toContainText('Ana');
    // …and can move to Team A, which still has an open seat.
    await a.page.locator('#btn-join-team-0').click();
    await expect(host.page.getByTestId('team-group-0')).toContainText('Ana');
    await expect(a.page.locator('#btn-join-team-0')).toHaveCount(0);
    // No early start in a team game.
    await expect(host.page.locator('#btn-start-game')).toHaveCount(0);

    const b = await joinRoom(browser, { name: 'Bo', roomCode: host.roomCode });
    const c = await joinRoom(browser, { name: 'Cy', roomCode: host.roomCode });

    for (const p of [host.page, a.page, b.page, c.page]) {
      await expect(p.getByTestId('turn-text')).toBeVisible({ timeout: 15_000 });
      await expect(p.getByTestId('panel-team-0')).toContainText('Host');
      await expect(p.getByTestId('panel-team-0')).toContainText('Ana');
      await expect(p.getByTestId('panel-team-1')).toContainText('Bo');
      await expect(p.getByTestId('panel-team-1')).toContainText('Cy');
    }
    // Partners are labelled on the board itself too.
    await expect(host.page.locator('svg text', { hasText: 'Ana · A' })).toBeVisible();
    // Ana is the host's partner, so her turn would say so; the host goes first.
    await expect(host.page.getByTestId('turn-text')).toHaveText(/your turn/i);
    await expect(a.page.getByTestId('turn-text')).toHaveText(/Host's turn \(your partner\)/);
    await expect(b.page.getByTestId('turn-text')).toHaveText(/^Host's turn$/);

    // The host's remove menu lists only the other team — never the partner.
    await host.page.locator('#btn-manage-players').click();
    const menu = host.page.getByTestId('kick-menu');
    await expect(menu).toContainText('Bo');
    await expect(menu).toContainText('Cy');
    await expect(menu).not.toContainText('Ana');

    for (const x of [host, a, b, c]) await x.ctx.close();
  });
});

test.describe('UI on a phone', () => {
  test('whose turn it is is never cut off, and nothing overflows the screen', async ({ browser }) => {
    test.setTimeout(60_000);
    const host = await createRoom(browser, { name: 'Bartholomew-Longname', count: 2, ctxOptions: PHONE });
    const guest = await joinRoom(browser, { name: 'Maximiliana-Longer', roomCode: host.roomCode, ctxOptions: PHONE });

    for (const p of [host.page, guest.page]) {
      const turn = p.getByTestId('turn-text');
      await expect(turn).toBeVisible({ timeout: 15_000 });
      expect(await notClipped(turn)).toBe(true);
      // No sideways scrolling.
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // Board, player list and dice all fit on screen at once.
      for (const loc of [p.locator('svg[role="img"]'), p.getByTestId('player-panel'), p.locator('#btn-roll-dice')]) {
        const box = await loc.boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(844 + 1);
      }
    }
    await expect(guest.page.getByTestId('turn-text')).toContainText('Bartholomew-Longname');

    await host.ctx.close();
    await guest.ctx.close();
  });

  test('the invite link is shown in full on a phone', async ({ browser }) => {
    const host = await createRoom(browser, { name: 'Linker', count: 2, ctxOptions: PHONE });
    const url = host.page.getByTestId('share-url');
    await expect(url).toContainText(host.roomCode);
    await expect(url).toContainText('http');
    expect(await notClipped(url)).toBe(true);
    await host.ctx.close();
  });
});

// REGRESSION: while the dice was still spinning, the top bar switched to the
// next player (and a forced-move hint appeared) — both gave away the roll
// before the dice landed.
test('nothing gives the roll away while the dice is still spinning', async ({ browser }) => {
  test.setTimeout(60_000);
  const host = await createRoom(browser, { name: 'Roller', count: 3 });
  const guest = await joinRoom(browser, { name: 'Watcher', roomCode: host.roomCode });
  const third = await joinRoom(browser, { name: 'Third', roomCode: host.roomCode });
  await expect(host.page.getByTestId('turn-text')).toHaveAttribute('data-my-turn', 'true', { timeout: 15_000 });

  await host.page.locator('#btn-roll-dice').click();
  const started = Date.now();
  let sawRolling = false;
  while (Date.now() - started < 2800) {
    const rolling = await host.page.locator('#btn-roll-dice').getAttribute('data-rolling');
    if (rolling === 'true') {
      sawRolling = true;
      await expect(host.page.getByTestId('turn-text')).toHaveText(/your turn/i, { timeout: 100 });
      await expect(guest.page.getByTestId('turn-text')).toHaveText(/Roller's turn/, { timeout: 100 });
      expect(await host.page.getByText(/only one move/i).count()).toBe(0);
    }
    await host.page.waitForTimeout(150);
  }
  expect(sawRolling).toBe(true);

  // After a dud roll the turn moves on but the number stays on the dice for
  // everyone still waiting — it has to say whose roll it was, not sit under
  // the next player's name. The player now up gets a blank dice to roll.
  const value = await host.page.locator('#btn-roll-dice').getAttribute('data-value', { timeout: 5000 });
  if (value && value !== '6') {
    await expect(guest.page.getByTestId('turn-text')).toHaveText(/your turn/i, { timeout: 8000 });
    await expect(host.page.getByText(`You rolled ${value}`)).toBeVisible();
    await expect(third.page.getByText(`Roller rolled ${value}`)).toBeVisible();
    await expect(guest.page.locator('#btn-roll-dice')).toHaveAttribute('data-value', '');
    await expect(guest.page.getByText('Tap the dice to roll')).toBeVisible();
  }

  await host.ctx.close();
  await guest.ctx.close();
  await third.ctx.close();
});

test('the ping indicator sits inside the top bar, not over the page', async ({ browser }) => {
  const host = await createRoom(browser, { name: 'Pinger', count: 2 });
  const guest = await joinRoom(browser, { name: 'Ponger', roomCode: host.roomCode });
  await expect(host.page.getByTestId('turn-text')).toBeVisible({ timeout: 15_000 });
  const position = await host.page.locator('#ping-indicator').evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe('static');
  await host.ctx.close();
  await guest.ctx.close();
});

test('on the 5-player board, your own home is turned to face you', async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await createRoom(browser, { name: 'P0', count: 5 });
  const others = [];
  for (const n of ['P1', 'P2', 'P3', 'P4']) others.push(await joinRoom(browser, { name: n, roomCode: host.roomCode }));

  const everyone = [{ page: host.page, name: 'P0' }, ...others.map((o, i) => ({ page: o.page, name: `P${i + 1}` }))];
  for (const { page, name } of everyone) {
    const board = page.getByRole('img', { name: /Hexagonal Ludo board/ });
    await expect(board).toBeVisible({ timeout: 15_000 });
    // Your own name label is the lowest one on the board.
    const ys = {};
    for (const n of ['P0', 'P1', 'P2', 'P3', 'P4']) {
      const box = await board.locator('text', { hasText: new RegExp(`^${n}$`) }).boundingBox();
      ys[n] = box.y;
    }
    const lowest = Object.entries(ys).sort((a, b) => b[1] - a[1])[0][0];
    expect(lowest).toBe(name);
  }

  await host.ctx.close();
  for (const o of others) await o.ctx.close();
});
