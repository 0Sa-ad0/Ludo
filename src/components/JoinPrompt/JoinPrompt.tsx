'use client';

import { useState } from 'react';
import Link from 'next/link';
import { STORAGE_NAME } from '@/lib/constants';
import { useStoredPreference } from '@/lib/useStoredPreference';
import styles from './JoinPrompt.module.css';

/**
 * Shown when someone opens a shared /game/CODE link directly.
 *
 * Without this the page had no name to join with and the server created a
 * player literally called "undefined" — which broke the single most important
 * flow in the app, since sharing that link is how everyone else gets in.
 */
interface Props {
  roomCode: string;
  onSubmit: (playerName: string, password: string) => void;
}

export default function JoinPrompt({ roomCode, onSubmit }: Props) {
  // Most people rejoin under the name they used last time.
  const [name, setName] = useStoredPreference(STORAGE_NAME, '');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const valid = trimmed.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit(trimmed, password);
  }

  return (
    <form className={`${styles.card} card`} onSubmit={submit}>
      <h2 className={`${styles.title} font-orbitron neon-text-pink`}>Join Game</h2>
      <p className={styles.sub}>
        Room <strong className="font-orbitron" data-testid="room-code">{roomCode}</strong>
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="join-prompt-name">Your Name</label>
        <input
          id="join-prompt-name"
          className="input"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
          autoComplete="nickname"
        />
        {touched && !valid && <p className={styles.error}>Please enter a name</p>}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="join-prompt-password">
          Password <span className={styles.optional}>(only if the room has one)</span>
        </label>
        <input
          id="join-prompt-password"
          className="input"
          type="password"
          placeholder="Leave blank if none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
        />
      </div>

      <button id="btn-join-prompt" type="submit" className="btn btn-primary" style={{ width: '100%' }}>
        🚪 Join Game
      </button>
      <Link href="/" className={styles.back}>← Back to lobby</Link>
    </form>
  );
}
