'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PingIndicator from '@/components/PingIndicator/PingIndicator';
import styles from './leaderboard.module.css';

interface LeaderboardEntry {
  player_name: string;
  wins: number;
  games_played: number;
  win_rate: number;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [sortBy, setSortBy] = useState<'wins' | 'games_played' | 'win_rate'>('wins');

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries || []);
        setUnavailable(!!d.unavailable);
        setLoading(false);
      })
      .catch(() => { setUnavailable(true); setLoading(false); });
  }, []);

  const sorted = [...entries].sort((a, b) => b[sortBy] - a[sortBy]);

  return (
    <div className={styles.page}>
      <PingIndicator socket={null} />

      <button className="btn btn-ghost" onClick={() => router.push('/')} id="btn-back-home" style={{ alignSelf: 'flex-start' }}>
        ← Back
      </button>

      <header className={styles.header}>
        <h1 className={`${styles.title} font-orbitron neon-text-gold`}>🏆 Leaderboard</h1>
        <p className={styles.sub}>All-time rankings across all games</p>
      </header>

      {/* Sort tabs */}
      <div className={styles.tabs}>
        {(['wins', 'games_played', 'win_rate'] as const).map(key => (
          <button
            key={key}
            id={`sort-${key}`}
            className={`${styles.tab} ${sortBy === key ? styles.tabActive : ''}`}
            onClick={() => setSortBy(key)}
          >
            {key === 'wins' ? '🥇 Wins' : key === 'games_played' ? '🎮 Games' : '📊 Win Rate'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading…</span>
        </div>
      ) : unavailable ? (
        // Distinct from "no games yet" on purpose — a database that isn't
        // running shouldn't look like a wiped history.
        <div className={styles.empty} data-testid="leaderboard-unavailable">
          <p>Leaderboard unavailable.</p>
          <p className={styles.emptyHint}>
            The database isn&apos;t reachable — start MySQL and reload. Games still play fine without it.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>
          <p>No games played yet.</p>
          <p className={styles.emptyHint}>Finish a game to appear here!</p>
        </div>
      ) : (
        <div className={styles.table}>
          {/* Header */}
          <div className={`${styles.row} ${styles.headerRow}`}>
            <span className={styles.colRank}>#</span>
            <span className={styles.colName}>Player</span>
            <span className={styles.colNum}>Wins</span>
            <span className={styles.colNum}>Games</span>
            <span className={styles.colNum}>Win %</span>
          </div>

          {sorted.map((entry, i) => {
            const medals = ['🥇','🥈','🥉'];
            const winPct = entry.games_played > 0 ? Math.round((entry.wins / entry.games_played) * 100) : 0;
            return (
              <div key={entry.player_name} className={`${styles.row} ${i < 3 ? styles.topRow : ''}`}
                style={{ animationDelay: `${i * 0.05}s` }}>
                <span className={styles.colRank}>{medals[i] || (i + 1)}</span>
                <span className={styles.colName}>{entry.player_name}</span>
                <span className={`${styles.colNum} ${styles.winsNum}`}>{entry.wins}</span>
                <span className={styles.colNum}>{entry.games_played}</span>
                <span className={styles.colNum}>{winPct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
