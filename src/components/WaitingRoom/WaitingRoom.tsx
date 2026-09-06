'use client';

import { useState } from 'react';
import type { GameState } from '@/lib/types';
import { PLAYER_COLORS } from '@/lib/constants';
import { MIN_PLAYERS } from '@/lib/board';
import styles from './WaitingRoom.module.css';

interface Props {
  gameState: GameState;
  roomCode: string;
  shareUrl: string;
  myPlayerIndex: number;
  onStart: () => void;
  onKick: (slotIndex: number) => void;
  onLeave: () => void;
}

export default function WaitingRoom({
  gameState, roomCode, shareUrl, myPlayerIndex, onStart, onKick, onLeave,
}: Props) {
  const [copied, setCopied] = useState<'code' | 'url' | null>(null);

  const me     = gameState.players[myPlayerIndex];
  const isHost = !!me?.isHost;
  const joined = gameState.players.length;
  const canStartEarly = isHost && joined >= MIN_PLAYERS && joined < gameState.playerCount;

  async function copy(text: string, which: 'code' | 'url') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
    } catch { /* clipboard blocked (insecure origin) — the text is on screen anyway */ }
  }

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.card} card`}>
        <h2 className={`${styles.title} font-orbitron neon-text-pink`}>Waiting for Players</h2>
        <p className={styles.sub} data-testid="waiting-count">
          {joined} / {gameState.playerCount} joined
        </p>

        <div className={styles.codeBox}>
          <span className={styles.codeLabel}>Room Code</span>
          <span className={`${styles.code} font-orbitron`} data-testid="room-code">{roomCode}</span>
          <button className="btn btn-ghost" onClick={() => copy(roomCode, 'code')} id="btn-copy-code">
            {copied === 'code' ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {shareUrl && (
          <div className={styles.urlBox}>
            <span className={styles.urlLabel}>Share Link</span>
            <span className={styles.url} title={shareUrl}>{shareUrl}</span>
            <button className="btn btn-ghost" onClick={() => copy(shareUrl, 'url')}
              id="btn-copy-url" aria-label="Copy share link">
              {copied === 'url' ? '✓' : '📋'}
            </button>
          </div>
        )}

        <div className={styles.playersList}>
          {Array.from({ length: gameState.playerCount }, (_, i) => {
            const player = gameState.players[i];
            const color  = player ? PLAYER_COLORS[player.colorIndex] : null;
            return (
              <div
                key={i}
                className={`${styles.playerSlot} ${player ? styles.playerSlotFilled : styles.playerSlotEmpty}`}
                style={player ? { borderColor: `${color?.hex}60` } : undefined}
              >
                {player ? (
                  <>
                    <div className={styles.playerDot}
                      style={{ background: color?.hex, boxShadow: `0 0 8px ${color?.hex}` }} />
                    <span className={styles.playerName}>{player.name}</span>
                    {player.isHost && <span className={styles.hostBadge} title="Host">👑</span>}
                    {i === myPlayerIndex && <span className={styles.youBadge}>YOU</span>}
                    {isHost && i !== myPlayerIndex && (
                      <button
                        className={styles.kickBtn}
                        onClick={() => onKick(i)}
                        aria-label={`Remove ${player.name}`}
                        title={`Remove ${player.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className={styles.emptyDot} />
                    <span className={styles.emptyText}>Waiting…</span>
                    <span className={styles.spinner2} />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {canStartEarly && (
          <button id="btn-start-game" className="btn btn-primary" style={{ width: '100%' }} onClick={onStart}>
            ▶ Start with {joined} player{joined === 1 ? '' : 's'}
          </button>
        )}

        <p className={styles.hint}>
          {isHost
            ? joined < MIN_PLAYERS
              ? `Waiting for at least ${MIN_PLAYERS} players…`
              : `Starts automatically at ${gameState.playerCount} — or start early above.`
            : `Starts automatically when all ${gameState.playerCount} players join.`}
        </p>

        <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onLeave} id="btn-leave-room">
          Leave room
        </button>
      </div>
    </div>
  );
}
