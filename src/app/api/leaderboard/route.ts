import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const [rows] = await pool.execute(
      'SELECT player_name, wins, games_played FROM leaderboard ORDER BY wins DESC, games_played ASC LIMIT 50'
    ) as any;
    const entries = (rows as any[]).map(r => ({
      ...r,
      win_rate: r.games_played > 0 ? r.wins / r.games_played : 0,
    }));
    return NextResponse.json({ entries });
  } catch (e: any) {
    return NextResponse.json({ entries: [], error: e.message }, { status: 200 });
  }
}
