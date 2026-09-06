const { defineConfig, devices } = require('@playwright/test');

const PORT = 4444;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // multiplayer tests share server-side room state; keep runs serial
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Build + run in production mode rather than `node server.js` in dev
    // mode. Dev mode adds real, high-variance latency that has nothing to
    // do with the app itself — on-demand page compilation, HMR websockets,
    // and (with reactStrictMode on) a dev-only double-mount that opens and
    // tears down a throwaway socket connection on every page load. That
    // was causing accumulating flakiness deep into a full suite run.
    // Production is also just the more honest thing to test against.
    // Not `npm run start` — that script hardcodes `NODE_ENV=production` with
    // Unix inline-env syntax, which cmd.exe can't parse. NODE_ENV is set
    // below instead, via Playwright's own cross-platform env option.
    command: 'npm run build && node server.js',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      // Isolated, nonexistent DB name so E2E runs never touch real game/leaderboard
      // data — server.js already degrades gracefully to in-memory-only when the
      // configured database can't be reached or doesn't exist.
      DB_NAME: 'ludo_game_e2e_test',
      // Short grace period so the badge-rendering E2E tests run in seconds,
      // not the real 30s production value. The precise "reconnect cancels
      // the pending AUTO flip" timing guarantee is covered by the dedicated
      // socket-level integration test instead (see tests/integration/), not
      // here — see the comment in tests/e2e/reconnect.spec.js for why.
      RECONNECT_GRACE_MS: '4000',
      // The opposite direction: park the idle-turn watchdog well beyond any
      // test's runtime. A browser test that rolls in a loop can otherwise
      // drift past the production 45s and have the server play its turn
      // mid-assertion. The watchdog itself is covered in tests/integration/
      // where the timing can be driven deterministically.
      TURN_TIMEOUT_MS: '600000',
    },
  },
});
