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
  // but this app's primary use case IS someone else opening the host's
  // address in dev mode (`node server.js`, no build step) — over LAN, mDNS,
  // or ngrok — and without this, the page never finishes hydrating: HTML
  // renders, but every click silently does nothing because React never
  // attached. NGROK_DOMAIN is set by start.bat (inherited here since node
  // server.js runs later in that same script) when a tunnel is configured.
  allowedDevOrigins: [
    ...lanAddresses(),
    'localhost',
    'ludo.local',
    ...(process.env.NGROK_DOMAIN ? [process.env.NGROK_DOMAIN] : []),
  ],
  turbopack: {
    // Pin the workspace root. Otherwise Turbopack walks up past the repo,
    // finds an unrelated package-lock.json in the parent directory and warns
    // on every build.
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
