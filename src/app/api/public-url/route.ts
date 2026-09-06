import { NextResponse } from 'next/server';

/** Set by an ngrok bootstrap script, if one is running. */
declare global {
  var __LUDO_PUBLIC_URL: string | undefined;
}

export async function GET() {
  return NextResponse.json({ url: globalThis.__LUDO_PUBLIC_URL ?? null });
}
