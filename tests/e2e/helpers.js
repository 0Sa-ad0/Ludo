/**
 * Next.js dev-mode (Fast Refresh) occasionally swallows the first click on a
 * freshly-hydrated page — the click registers but the React state update
 * doesn't land. Retrying the click a couple of times is the standard,
 * pragmatic mitigation for this well-known dev-server characteristic; it
 * does not occur against a production build.
 */
async function clickUntil(page, clickLocator, waitLocator, { attempts = 3, timeout = 3000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    await clickLocator.click();
    try {
      await waitLocator.waitFor({ state: 'visible', timeout });
      return;
    } catch {
      if (i === attempts - 1) throw new Error(`clickUntil: target never became visible after ${attempts} attempts`);
    }
  }
}

module.exports = { clickUntil };
