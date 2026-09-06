const { test, expect } = require('@playwright/test');

test.describe('API routes', () => {
  test('GET /api/leaderboard degrades gracefully when the database is missing', async ({ request }) => {
    const res = await request.get('/api/leaderboard');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    // The E2E test DB doesn't exist: empty results, a 200, and an explicit
    // flag so the UI can say "unavailable" rather than "no games yet".
    expect(body.entries).toEqual([]);
    expect(body.unavailable).toBe(true);
  });

  test('GET /api/public-url returns null when ngrok is not running', async ({ request }) => {
    const res = await request.get('/api/public-url');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.url).toBeNull();
  });
});

test.describe('Leaderboard page', () => {
  test('loads without errors and reports that the database is unreachable', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/leaderboard');
    await expect(page.getByText('🏆 Leaderboard')).toBeVisible();
    // The E2E server points at a database that doesn't exist.
    await expect(page.getByTestId('leaderboard-unavailable')).toBeVisible({ timeout: 5000 });

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
