'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6];

export default function LobbyPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [playerCount, setPlayerCount] = useState(4);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  // Fetch public URL (ngrok) from server
  useEffect(() => {
    fetch('/api/public-url')
      .then(r => r.json())
      .then(d => { if (d.url) setPublicUrl(d.url); })
      .catch(() => {});
  }, []);

  function handleCreate() {
    if (!playerName.trim()) { setError('Enter your name'); return; }
    setError('');
    setLoading(true);
    // Store intent in sessionStorage — actual socket create happens in game page
    sessionStorage.setItem('ludo_create', JSON.stringify({
      playerName: playerName.trim(),
      playerCount,
      password: usePassword ? password : '',
    }));
    router.push('/game/create');
  }

  function handleJoin() {
    if (!playerName.trim()) { setError('Enter your name'); return; }
    if (!roomCode.trim())   { setError('Enter a room code'); return; }
    setError('');
    setLoading(true);
    sessionStorage.setItem('ludo_join', JSON.stringify({
      playerName: playerName.trim(),
      roomCode: roomCode.toUpperCase().trim(),
      password,
    }));
    router.push(`/game/${roomCode.toUpperCase().trim()}`);
  }

  return (
    <div className={styles.page}>
      {/* Background particles */}
      <div className={styles.particles} aria-hidden />

      <header className={styles.header}>
        <h1 className={`${styles.title} font-orbitron neon-text-pink`}>LUDO</h1>
        <p className={styles.subtitle}>Neon Edition</p>
        <div className={styles.tagline}>2–6 Players · Real-time Multiplayer</div>
      </header>

      {mode === 'home' && (
        <div className={`${styles.card} card`} style={{ animation: 'scale-in 0.3s ease' }}>
          <button
            id="btn-create-room"
            className={`btn btn-primary ${styles.mainBtn}`}
            onClick={() => setMode('create')}
          >
            🎮 Create Room
          </button>
          <button
            id="btn-join-room"
            className={`btn btn-secondary ${styles.mainBtn}`}
            onClick={() => setMode('join')}
          >
            🔗 Join Room
          </button>
          <button
            id="btn-leaderboard"
            className={`btn btn-ghost ${styles.mainBtn}`}
            onClick={() => router.push('/leaderboard')}
          >
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
        <div className={`${styles.card} card`} style={{ animation: 'slide-up 0.3s ease' }}>
          <button className={`btn btn-ghost ${styles.backBtn}`} onClick={() => { setMode('home'); setError(''); }}>← Back</button>
          <h2 className={`${styles.sectionTitle} font-orbitron`}>Create Room</h2>

          <div className={styles.field}>
            <label className={styles.label}>Your Name</label>
            <input
              id="input-create-name"
              className="input"
              placeholder="Enter your name"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={20}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Number of Players</label>
            <div className={styles.playerCountGrid}>
              {PLAYER_COUNT_OPTIONS.map(n => (
                <button
                  key={n}
                  id={`btn-player-count-${n}`}
                  className={`${styles.countBtn} ${playerCount === n ? styles.countBtnActive : ''}`}
                  onClick={() => setPlayerCount(n)}
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
              <input
                type="checkbox"
                id="chk-password"
                checked={usePassword}
                onChange={e => setUsePassword(e.target.checked)}
                className={styles.checkbox}
              />
              <span>Set room password (optional)</span>
            </label>
            {usePassword && (
              <input
                id="input-create-password"
                className="input"
                type="password"
                placeholder="Room password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ marginTop: 8 }}
              />
            )}
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button
            id="btn-create-confirm"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? 'Creating...' : '🚀 Create Game'}
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className={`${styles.card} card`} style={{ animation: 'slide-up 0.3s ease' }}>
          <button className={`btn btn-ghost ${styles.backBtn}`} onClick={() => { setMode('home'); setError(''); }}>← Back</button>
          <h2 className={`${styles.sectionTitle} font-orbitron`}>Join Room</h2>

          <div className={styles.field}>
            <label className={styles.label}>Your Name</label>
            <input
              id="input-join-name"
              className="input"
              placeholder="Enter your name"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={20}
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Room Code</label>
            <input
              id="input-room-code"
              className="input"
              placeholder="e.g. ABC123"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ fontFamily: 'Orbitron, monospace', letterSpacing: '0.15em', fontSize: '1.2rem', textAlign: 'center' }}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password (if required)</label>
            <input
              id="input-join-password"
              className="input"
              type="password"
              placeholder="Leave blank if no password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button
            id="btn-join-confirm"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8 }}
            onClick={handleJoin}
            disabled={loading}
          >
            {loading ? 'Joining...' : '🚪 Join Game'}
          </button>
        </div>
      )}

      <footer className={styles.footer}>
        <span>Share the room code with friends · Same WiFi or via ngrok</span>
      </footer>
    </div>
  );
}
