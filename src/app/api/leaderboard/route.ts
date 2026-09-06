import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export interface LeaderboardEntry {
  player_name: string;
  wins: number;
  games_played: number;
  win_rate: number;
}

export async function GET() {
  try {
    const [rows] = await pool.execute(
      'SELECT player_name, wins, games_played FROM leaderboard ORDER BY wins DESC, games_played ASC LIMIT 50'
    );
    const entries: LeaderboardEntry[] = (rows as LeaderboardEntry[]).map((r) => ({
      ...r,
      win_rate: r.games_played > 0 ? r.wins / r.games_played : 0,
    }));
    return NextResponse.json({ entries, unavailable: false });
  } catch (e) {
    // The game is playable without MySQL, so this is a 200 with a flag rather
    // than an error page — but it has to be distinguishable from a genuinely
    // empty leaderboard, or a broken database just looks like "no games yet"
    // and people think their history was lost.
    // Connection failures often carry an empty `.message`, so prefer the code.
    const err = e as { code?: string; message?: string };
    console.warn('[API] leaderboard query failed:', err.code || err.message || String(e));
    return NextResponse.json({ entries: [], unavailable: true });
  }
}
