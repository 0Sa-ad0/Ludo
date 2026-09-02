import { NextResponse } from 'next/server';

// The public URL is set by server.js via a global variable when ngrok starts
export async function GET() {
  const url = (global as any).__LUDO_PUBLIC_URL || null;
  return NextResponse.json({ url });
}
