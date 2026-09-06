'use client';

import type { Player } from '@/lib/types';
import { PLAYER_COLORS } from '@/lib/constants';
import styles from './PlayerPanel.module.css';

interface Props {
  player: Player;
  isMyTurn: boolean;
  isMe: boolean;
}

export default function PlayerPanel({ player, isMyTurn, isMe }: Props) {
  const color = PLAYER_COLORS[player.colorIndex];
  const finished = player.pieces.filter((p) => p.status === 'finished').length;

  const status = player.isFinished
    ? `finished in place ${player.finishRank}`
    : !player.isConnected && player.isAuto
      ? 'disconnected, playing on AUTO'
      : !player.isConnected
        ? 'reconnecting'
        : isMyTurn
          ? 'taking their turn'
          : 'waiting';

  return (
    <div
      className={`${styles.panel} ${isMyTurn ? styles.active : ''} ${player.isFinished ? styles.finished : ''}`}
      style={{ '--color': color.hex, '--glow': color.glow } as React.CSSProperties}
      id={`player-panel-${player.slotIndex}`}
      aria-label={`${player.name}, ${finished} of 4 home, ${status}`}
    >
      <div className={styles.colorStrip} style={{ background: color.hex, boxShadow: `0 0 10px ${color.hex}` }} />

      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.name} title={player.name}>{player.name}</span>
          {isMe && <span className={styles.youBadge}>YOU</span>}
          {player.isHost && !player.isFinished && (
            <span className={styles.hostBadge} title="Host">👑</span>
          )}
          {!player.isConnected && !player.isAuto && !player.isFinished && (
            <span className={styles.reconnectingBadge}
              data-testid={`reconnecting-${player.slotIndex}`} title="Reconnecting…">🔌</span>
          )}
          {player.isAuto && !player.isConnected && (
            <span className={styles.autoBadge}
              data-testid={`auto-${player.slotIndex}`} title="AUTO — playing on their behalf">🤖</span>
          )}
          {player.isFinished && player.finishRank && (
            <span className={styles.rankBadge} title={`Finished #${player.finishRank}`}>
              #{player.finishRank}
            </span>
          )}
        </div>

        {/* The winner keeps watching rather than being dropped from the board. */}
        {player.isFinished && (
          <span className={styles.spectating} data-testid={`spectating-${player.slotIndex}`}>
            👑 Spectating
          </span>
        )}

        <div className={styles.pieces} aria-hidden>
          {player.pieces.map((piece) => (
            <div
              key={piece.id}
              className={`${styles.pieceDot} ${
                piece.status === 'finished' ? styles.pieceFinished
                : piece.status === 'active' ? styles.pieceActive
                : styles.pieceHome
              }`}
              style={{ background: piece.status === 'active' ? color.hex : undefined }}
              title={piece.status}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
