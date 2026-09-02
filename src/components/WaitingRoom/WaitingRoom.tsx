'use client';

import { useState } from 'react';
import type { GameState } from '@/lib/types';
import { PLAYER_COLORS } from '@/lib/constants';
import styles from './WaitingRoom.module.css';

interface Props {
  gameState: GameState;
  roomCode: string;
  shareUrl: string;
  myPlayerIndex: number;
}

export default function WaitingRoom({ gameState, roomCode, shareUrl, myPlayerIndex }: Props) {
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyUrl() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.card} card`}>
        <h2 className={`${styles.title} font-orbitron neon-text-pink`}>Waiting for Players</h2>
        <p className={styles.sub}>{gameState.players.length} / {gameState.playerCount} joined</p>

        {/* Room code */}
        <div className={styles.codeBox}>
          <span className={styles.codeLabel}>Room Code</span>
          <span className={`${styles.code} font-orbitron`}>{roomCode}</span>
          <button className="btn btn-ghost" onClick={copyCode} id="btn-copy-code">
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {shareUrl && (
          <div className={styles.urlBox}>
            <span className={styles.urlLabel}>Share Link</span>
            <span className={styles.url}>{shareUrl}</span>
            <button className="btn btn-ghost" onClick={copyUrl} id="btn-copy-url">
              {copied ? '✓' : '📋'}
            </button>
          </div>
        )}

        {/* Players list */}
        <div className={styles.playersList}>
          {Array.from({ length: gameState.playerCount }, (_, i) => {
            const player = gameState.players[i];
            const isMe   = i === myPlayerIndex;
            const color  = player ? PLAYER_COLORS[player.colorIndex] : null;
            return (
              <div key={i} className={`${styles.playerSlot} ${player ? styles.playerSlotFilled : styles.playerSlotEmpty}`}
                style={player ? { borderColor: `${color?.hex}60` } : undefined}>
                {player ? (
                  <>
                    <div className={styles.playerDot} style={{ background: color?.hex, boxShadow: `0 0 8px ${color?.hex}` }} />
                    <span className={styles.playerName}>{player.name}</span>
                    {isMe && <span className={styles.youBadge}>YOU</span>}
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

        <p className={styles.hint}>Game starts automatically when all {gameState.playerCount} players join</p>
      </div>
    </div>
  );
}
