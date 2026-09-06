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
}

export default function DiceRoller({
  value, rolling, canRoll, waitingForMove, onRoll, currentPlayerColor,
}: Props) {
  // Cycle the face while tumbling so the dice reads as *rolling* rather than
  // just spinning on its final value.
  const [face, setFace] = useState(1);

  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 80);
    return () => clearInterval(id);
  }, [rolling]);

  const shown = rolling ? face : (value ?? 1);
  const dots  = DOTS[shown] ?? DOTS[1];

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
          {dots.map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={8} fill={currentPlayerColor}
              style={{ filter: `drop-shadow(0 0 4px ${currentPlayerColor})` }} />
          ))}
        </svg>
      </button>

      <div className={styles.hint}>
        {rolling ? (
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
