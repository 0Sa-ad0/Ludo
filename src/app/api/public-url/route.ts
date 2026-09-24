import { NextResponse } from 'next/server';
import { networkInterfaces } from 'os';

declare global {
  /** Set once ngrok's local API answers, if it's running — a tunnel URL is
   *  stable once established, so caching this one (in server.js) is fine. */
  var __LUDO_PUBLIC_URL: string | undefined;
  /** The mDNS hostname server.js is answering queries for (e.g. "ludo.local")
   *  — constant for the process's life, only the IP it resolves to changes. */
  var __LUDO_MDNS_HOSTNAME: string | undefined;
  /** The real port server.js is listening on. Not inferred from the request
   *  — see the comment where server.js sets this for why that comes back
   *  wrong under this custom-server setup. */
  var __LUDO_PORT: number | undefined;
}

// Windows (and WSL/Docker/Hyper-V on it) auto-creates virtual adapters
// alongside the real WiFi/Ethernet NIC — e.g. "vEthernet (WSL)" handing out
// a 172.x address only reachable from this machine. Kept in sync with the
// same filter in server.js's own startup printout.
const isVirtualAdapter = (name: string) =>
  /vEthernet|Virtual|VMware|VirtualBox|Hyper-V|Loopback|Docker|WSL|Tailscale|ZeroTier/i.test(name);

/**
 * Re-detected on every request rather than cached at boot — a DHCP lease can
 * hand this machine a new LAN address at any point while the server keeps
 * running, and a cached-at-startup value would keep confidently reporting
 * the old, now-dead one forever after that happened.
 */
function currentLanUrl(port: string): string | null {
  const nets = networkInterfaces();
  const candidates: { name: string; address: string }[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) candidates.push({ name, address: net.address });
    }
  }
  const real = candidates.filter((c) => !isVirtualAdapter(c.name));
  const best = (real.length > 0 ? real : candidates)[0];
  return best ? `http://${best.address}:${port}` : null;
}

export async function GET() {
  const port = String(globalThis.__LUDO_PORT ?? 4000);
  const mdnsHostname = globalThis.__LUDO_MDNS_HOSTNAME ?? null;
  return NextResponse.json({
    url: globalThis.__LUDO_PUBLIC_URL ?? null,
    lanUrl: currentLanUrl(port),
    // A ".local" link that keeps resolving to whatever the current LAN
    // address actually is, even after it changes — see server.js's mDNS
    // responder. Offered as a fallback alongside lanUrl, not a replacement:
    // it depends on the joining device supporting mDNS (most do).
    mdnsUrl: mdnsHostname ? `http://${mdnsHostname}:${port}` : null,
  });
}
