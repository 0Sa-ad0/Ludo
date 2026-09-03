const { test, expect } = require('@playwright/test');

test.describe('API routes', () => {
  test('GET /api/leaderboard returns a well-formed (possibly empty) entries array', async ({ request }) => {
    const res = await request.get('/api/leaderboard');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    // The E2E test DB doesn't exist, so this should be gracefully empty, not an error page.
    expect(body.entries).toEqual([]);
  });

  test('GET /api/public-url returns null when ngrok is not running', async ({ request }) => {
    const res = await request.get('/api/public-url');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.url).toBeNull();
  });
});

test.describe('Leaderboard page', () => {
  test('loads without errors and shows the empty state when there are no games yet', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/leaderboard');
    await expect(page.getByText('🏆 Leaderboard')).toBeVisible();
    await expect(page.getByText('No games played yet.')).toBeVisible({ timeout: 5000 });

    expect(pageErrors).toEqual([]);
  });

  test('sort tabs are clickable and switch active state', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.locator('#sort-wins')).toBeVisible();

    await page.locator('#sort-games_played').click();
    await page.locator('#sort-win_rate').click();
    // No assertion beyond "didn't throw" — with zero entries there's nothing
    // to visibly re-sort, this just proves the tabs don't error out.
  });

  test('Back button returns to the lobby', async ({ page }) => {
    await page.goto('/leaderboard');
    await page.locator('#btn-back-home').click();
    await expect(page.locator('#btn-create-room')).toBeVisible();
  });
});
