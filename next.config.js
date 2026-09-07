const path = require('path');
const os  = require('os');

/**
 * Every non-internal IPv4 address of this machine — recomputed on every
 * server start, same as the "Network:" address server.js prints to the
 * console, so it tracks whatever network the host is actually on.
 */
function lanAddresses() {
  const addresses = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
    }
  }
  return addresses;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // The dev server refuses cross-origin requests to its /_next/* internal
  // resources by default. That's the right default for a random website,
  // but this app's primary use case IS someone else on the LAN opening the
  // host's IP address in dev mode (`node server.js`, no build step) — and
  // without this, the page never finishes hydrating: HTML renders, but
  // every click silently does nothing because React never attached.
  allowedDevOrigins: lanAddresses(),
  turbopack: {
    // Pin the workspace root. Otherwise Turbopack walks up past the repo,
    // finds an unrelated package-lock.json in the parent directory and warns
    // on every build.
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
