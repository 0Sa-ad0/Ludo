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
  const finishedPieces = player.pieces.filter(p => p.status === 'finished').length;
  const homePieces     = player.pieces.filter(p => p.status === 'home').length;
  const activePieces   = player.pieces.filter(p => p.status === 'active').length;

  return (
    <div
      className={`${styles.panel} ${isMyTurn ? styles.active : ''} ${player.isFinished ? styles.finished : ''}`}
      style={{ '--color': color.hex, '--glow': color.glow } as React.CSSProperties}
      id={`player-panel-${player.slotIndex}`}
    >
      {/* Color strip */}
      <div className={styles.colorStrip} style={{ background: color.hex, boxShadow: `0 0 10px ${color.hex}` }} />

      {/* Name + status */}
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <span className={styles.name} title={player.name}>{player.name}</span>
          {isMe && <span className={styles.youBadge}>YOU</span>}
          {!player.isConnected && !player.isAuto && !player.isFinished && (
            <span className={styles.reconnectingBadge} data-testid={`reconnecting-${player.slotIndex}`} title="Reconnecting…">🔌</span>
          )}
          {player.isAuto && !player.isConnected && (
            <span className={styles.autoBadge} data-testid={`auto-${player.slotIndex}`} title="AUTO — playing on their behalf">🤖</span>
          )}
          {player.isFinished && player.finishRank && (
            <span className={styles.rankBadge}>#{player.finishRank}</span>
          )}
        </div>

        {/* Piece indicators */}
        <div className={styles.pieces}>
          {player.pieces.map((piece) => (
            <div
              key={piece.id}
              className={`${styles.pieceDot} ${
                piece.status === 'finished' ? styles.pieceFinished :
                piece.status === 'active'   ? styles.pieceActive   :
                                              styles.pieceHome
              }`}
              style={{ background: piece.status !== 'home' ? color.hex : undefined }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
