'use client';

import type { GameState, Player } from '@/lib/types';
import { PLAYER_COLORS, TEAM_NAMES } from '@/lib/constants';
import { PIECES_PER_PLAYER } from '@/lib/board';
import styles from './PlayerPanel.module.css';

interface Props {
  gameState: GameState;
  myPlayerIndex: number;
  /** Whose turn to show — frozen on the roller while their dice is still
   *  spinning, so the panel can't give the result away early. */
  turnIndex: number;
}

/** Everyone at the table: whose turn it is, who's offline, and how close each
 *  player (or team) is to getting all their pieces home. */
export default function PlayerPanel({ gameState, myPlayerIndex, turnIndex }: Props) {
  const kicked = new Set(gameState.kickedOrder ?? []);
  const me = gameState.players[myPlayerIndex];
  const homeCount = (p: Player) => p.pieces.filter((pc) => pc.status === 'finished').length;

  function status(p: Player): string | null {
    if (kicked.has(p.slotIndex)) return 'Removed';
    if (p.isFinished) {
      if (gameState.teamMode && gameState.status === 'playing') return 'All home';
      return p.finishRank ? `Finished #${p.finishRank}` : 'Finished';
    }
    if (!p.isConnected) return 'Offline';
    return null;
  }

  function row(p: Player) {
    const color   = PLAYER_COLORS[p.colorIndex]?.hex ?? '#888';
    const isTurn  = gameState.status === 'playing' && p.slotIndex === turnIndex;
    const isMe    = p.slotIndex === myPlayerIndex;
    const partner = !!gameState.teamMode && !!me && !isMe && p.team === me.team;
    const home    = homeCount(p);
    const note    = status(p);
    return (
      <li
        key={p.id}
        className={`${styles.row} ${isTurn ? styles.turn : ''} ${note === 'Removed' ? styles.out : ''}`}
        style={{ '--c': color } as React.CSSProperties}
        data-testid={`panel-row-${p.slotIndex}`}
        data-turn={isTurn}
        aria-current={isTurn ? 'true' : undefined}
      >
        <span className={styles.dot} aria-hidden />
        <span className={styles.name}>
          {p.name}
          {p.isHost && <span className={styles.badge} title="Host"> 👑</span>}
        </span>
        {isMe && <span className={styles.tag}>YOU</span>}
        {partner && <span className={styles.tag}>PARTNER</span>}
        <span className={styles.progress} title={`${home} of ${PIECES_PER_PLAYER} pieces home`}>
          {Array.from({ length: PIECES_PER_PLAYER }, (_, i) => (
            <span key={i} className={`${styles.pip} ${i < home ? styles.pipOn : ''}`} />
          ))}
        </span>
        {note && (
          <>
            <span className={`${styles.note} ${note === 'Offline' ? styles.offline : ''}`}>{note}</span>
            {/* Phones show the same status as an icon — no room for the text. */}
            <span className={styles.noteIcon} title={note} aria-label={note}>
              {note === 'Offline' ? '🔌' : note === 'Removed' ? '✕' : '✓'}
            </span>
          </>
        )}
      </li>
    );
  }

  if (gameState.teamMode) {
    return (
      <div className={styles.panel} data-testid="player-panel">
        {[0, 1].map((team) => {
          const members = gameState.players.filter((p) => p.team === team);
          const home = members.reduce((n, p) => n + homeCount(p), 0);
          const mine = me?.team === team;
          return (
            <section key={team} className={styles.team} data-testid={`panel-team-${team}`}>
              <h3 className={styles.teamHead}>
                <span>{TEAM_NAMES[team]}{mine ? ' (you)' : ''}</span>
                <span className={styles.teamScore}>{home}/{members.length * PIECES_PER_PLAYER} home</span>
              </h3>
              <ul className={styles.list}>{members.map(row)}</ul>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="player-panel">
      <ul className={styles.list}>{gameState.players.map(row)}</ul>
    </div>
  );
}
