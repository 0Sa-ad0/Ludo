'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_CREATE, STORAGE_ROOM, STORAGE_NAME } from '@/lib/constants';
import { MIN_PLAYERS, MAX_PLAYERS } from '@/lib/board';
import { useStoredPreference } from '@/lib/useStoredPreference';
import styles from './page.module.css';

const PLAYER_COUNT_OPTIONS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i,
);

export default function LobbyPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [playerCount, setPlayerCount] = useState(4);
  // Remembered from the last game on this device.
  const [playerName, setPlayerName] = useStoredPreference(STORAGE_NAME, '');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  useEffect(() => {
    fetch('/api/public-url')
      .then((r) => r.json())
      .then((d) => { if (d.url) setPublicUrl(d.url); })
      .catch(() => {});
  }, []);

  // useStoredPreference already persists on write; this just normalises the
  // trimmed value before we navigate away.
  const remember = setPlayerName;

  function handleCreate() {
    const name = playerName.trim();
    if (!name) { setError('Enter your name'); return; }
    setError('');
    setLoading(true);
    remember(name);
    // The socket create happens on the game page; this just carries the intent.
    sessionStorage.setItem(STORAGE_CREATE, JSON.stringify({
      playerName: name,
      playerCount,
      password: usePassword ? password : '',
    }));
    router.push('/game/create');
  }

  function handleJoin() {
    const name = playerName.trim();
    const code = roomCode.toUpperCase().trim();
    if (!name) { setError('Enter your name'); return; }
    if (!code)  { setError('Enter a room code'); return; }
    setError('');
    setLoading(true);
    remember(name);
    // Keyed by room, so the game page can rejoin this exact seat on refresh.
    sessionStorage.setItem(STORAGE_ROOM(code), JSON.stringify({ playerName: name, password }));
    router.push(`/game/${code}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.particles} aria-hidden />

      <header className={styles.header}>
        <h1 className={`${styles.title} font-orbitron neon-text-pink`}>LUDO</h1>
        <p className={styles.subtitle}>Neon Edition</p>
        <div className={styles.tagline}>
          {MIN_PLAYERS}–{MAX_PLAYERS} Players · Real-time Multiplayer
        </div>
      </header>

      {mode === 'home' && (
        <div className={`${styles.card} card`} style={{ animation: 'scale-in 0.3s ease' }}>
          <button id="btn-create-room" className={`btn btn-primary ${styles.mainBtn}`}
            onClick={() => setMode('create')}>
            🎮 Create Room
          </button>
          <button id="btn-join-room" className={`btn btn-secondary ${styles.mainBtn}`}
            onClick={() => setMode('join')}>
            🔗 Join Room
          </button>
          <button id="btn-leaderboard" className={`btn btn-ghost ${styles.mainBtn}`}
            onClick={() => router.push('/leaderboard')}>
            🏆 Leaderboard
          </button>

          {publicUrl && (
            <div className={styles.publicUrl}>
              <span className={styles.publicUrlLabel}>Public URL (ngrok):</span>
              <a href={publicUrl} className={styles.publicUrlLink}>{publicUrl}</a>
            </div>
          )}
        </div>
      )}

      {mode === 'create' && (
        <form
          className={`${styles.card} card`}
          style={{ animation: 'slide-up 0.3s ease' }}
          onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
        >
          <button type="button" className={`btn btn-ghost ${styles.backBtn}`}
            onClick={() => { setMode('home'); setError(''); }}>← Back</button>
          <h2 className={`${styles.sectionTitle} font-orbitron`}>Create Room</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="input-create-name">Your Name</label>
            <input id="input-create-name" className="input" placeholder="Enter your name"
              value={playerName} onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20} autoFocus autoComplete="nickname" />
          </div>

          <div className={styles.field}>
            <span className={styles.label} id="player-count-label">Number of Players</span>
            <div className={styles.playerCountGrid} role="group" aria-labelledby="player-count-label">
              {PLAYER_COUNT_OPTIONS.map((n) => (
                <button
                  key={n} type="button" id={`btn-player-count-${n}`}
                  className={`${styles.countBtn} ${playerCount === n ? styles.countBtnActive : ''}`}
                  onClick={() => setPlayerCount(n)}
                  aria-pressed={playerCount === n}
                >
                  {n}
                  {n >= 5 && <span className={styles.hexTag}>HEX</span>}
                </button>
              ))}
            </div>
            {playerCount >= 5 && (
              <p className={styles.hint}>⬡ Hexagonal board will be used for {playerCount} players</p>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.checkboxRow}>
              <input type="checkbox" id="chk-password" checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)} className={styles.checkbox} />
              <span>Set room password (optional)</span>
            </label>
            {usePassword && (
              <input id="input-create-password" className="input" type="password"
                placeholder="Room password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password" style={{ marginTop: 8 }} />
            )}
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button id="btn-create-confirm" type="submit" className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? 'Creating…' : '🚀 Create Game'}
          </button>
        </form>
      )}

      {mode === 'join' && (
        <form
          className={`${styles.card} card`}
          style={{ animation: 'slide-up 0.3s ease' }}
          onSubmit={(e) => { e.preventDefault(); handleJoin(); }}
        >
          <button type="button" className={`btn btn-ghost ${styles.backBtn}`}
            onClick={() => { setMode('home'); setError(''); }}>← Back</button>
          <h2 className={`${styles.sectionTitle} font-orbitron`}>Join Room</h2>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="input-join-name">Your Name</label>
            <input id="input-join-name" className="input" placeholder="Enter your name"
              value={playerName} onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20} autoFocus autoComplete="nickname" />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="input-room-code">Room Code</label>
            <input id="input-room-code" className="input" placeholder="e.g. ABC123"
              value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              style={{ fontFamily: 'Orbitron, monospace', letterSpacing: '0.15em', fontSize: '1.2rem', textAlign: 'center' }} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="input-join-password">Password (if required)</label>
            <input id="input-join-password" className="input" type="password"
              placeholder="Leave blank if no password" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button id="btn-join-confirm" type="submit" className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? 'Joining…' : '🚪 Join Game'}
          </button>
        </form>
      )}

      <footer className={styles.footer}>
        <span>Share the room code or link with friends · Same WiFi, or anywhere via ngrok</span>
      </footer>
    </div>
  );
}
