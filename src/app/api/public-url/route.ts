import { NextResponse } from 'next/server';

/** Set by server.js at boot / once ngrok's local API answers, if it's running. */
declare global {
  var __LUDO_PUBLIC_URL: string | undefined;
  var __LUDO_LAN_URL: string | undefined;
}

export async function GET() {
  return NextResponse.json({
    url: globalThis.__LUDO_PUBLIC_URL ?? null,
    lanUrl: globalThis.__LUDO_LAN_URL ?? null,
  });
}
