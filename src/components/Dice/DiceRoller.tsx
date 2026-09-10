'use client';

import { useEffect, useState } from 'react';
import styles from './DiceRoller.module.css';

const DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

interface Props {
  value: number | null;
  rolling: boolean;
  canRoll: boolean;
  /** Rolled already, now choosing which piece to move. */
  waitingForMove?: boolean;
  onRoll: () => void;
  currentPlayerColor: string;
  /** Set while the server is about to play a forced single-legal-move for someone. */
  forcedMove?: { playerName: string; deadline: number } | null;
}

export default function DiceRoller({
  value, rolling, canRoll, waitingForMove, onRoll, currentPlayerColor, forcedMove,
}: Props) {
  // Cycle the face while tumbling so the dice reads as *rolling* rather than
  // just spinning on its final value.
  const [face, setFace] = useState(1);

  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 80);
    return () => clearInterval(id);
  }, [rolling]);

  // Idle (nobody has rolled yet this turn) used to render a literal face-1 —
  // indistinguishable from an actual roll of 1. An emoji placeholder can't be
  // mistaken for a result.
  const idle  = !rolling && value === null;
  const shown = rolling ? face : (value ?? 1);
  const dots  = DOTS[shown] ?? DOTS[1];

  // Countdown ring for a pending forced move — ticks down visually rather
  // than jumping straight from full to empty, so everyone in the room can
  // see it coming.
  const [remainingFrac, setRemainingFrac] = useState(1);
  useEffect(() => {
    if (!forcedMove) return undefined;
    const total = Math.max(1, forcedMove.deadline - Date.now());
    let raf: number;
    const tick = () => {
      const left = Math.max(0, forcedMove.deadline - Date.now());
      setRemainingFrac(left / total);
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [forcedMove]);

  const RING_R = 46;
  const RING_C = 2 * Math.PI * RING_R;

  return (
    <div className={styles.wrapper}>
      <button
        id="btn-roll-dice"
        data-value={value ?? ''}
        data-can-roll={canRoll}
        data-rolling={rolling}
        className={`${styles.dice} ${rolling ? styles.rolling : ''} ${canRoll ? styles.rollable : ''}`}
        onClick={onRoll}
        disabled={!canRoll}
        aria-label={canRoll ? 'Roll dice' : value !== null ? `Dice shows ${value}` : 'Dice'}
        aria-live="polite"
        style={{ '--player-color': currentPlayerColor } as React.CSSProperties}
      >
        <svg viewBox="0 0 100 100" className={styles.diceSvg} aria-hidden>
          <rect
            x={4} y={4} width={92} height={92} rx={18} ry={18}
            fill="var(--bg-card2)" stroke={currentPlayerColor} strokeWidth={3}
            style={{ filter: `drop-shadow(0 0 8px ${currentPlayerColor})` }}
          />
          {idle ? (
            <text x={50} y={54} textAnchor="middle" dominantBaseline="central" fontSize={44}>🎲</text>
          ) : (
            dots.map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={8} fill={currentPlayerColor}
                style={{ filter: `drop-shadow(0 0 4px ${currentPlayerColor})` }} />
            ))
          )}
          {forcedMove && (
            <circle
              cx={50} cy={50} r={RING_R} fill="none"
              stroke={currentPlayerColor} strokeWidth={4} strokeLinecap="round"
              strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - remainingFrac)}
              transform="rotate(-90 50 50)"
              style={{ filter: `drop-shadow(0 0 6px ${currentPlayerColor})` }}
            />
          )}
        </svg>
      </button>

      <div className={styles.hint}>
        {forcedMove ? (
          <span className={styles.tapHint} style={{ color: currentPlayerColor }}>
            {forcedMove.playerName} — only move, auto-playing…
          </span>
        ) : rolling ? (
          <span className={styles.waiting}>Rolling…</span>
        ) : canRoll ? (
          <span className={styles.tapHint} style={{ color: currentPlayerColor }}>TAP TO ROLL</span>
        ) : waitingForMove ? (
          <span className={styles.tapHint} style={{ color: currentPlayerColor }}>
            PICK A PIECE {value !== null && `· ${value}`}
          </span>
        ) : value !== null ? (
          <span className={styles.rolled}>Rolled <strong>{value}</strong></span>
        ) : (
          <span className={styles.waiting}>Waiting…</span>
        )}
      </div>
    </div>
  );
}
