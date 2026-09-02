'use client';

import { useState } from 'react';
import styles from './DiceRoller.module.css';

const DOTS: Record<number, number[][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 22], [75, 22], [25, 50], [75, 50], [25, 78], [75, 78]],
};

interface Props {
  value: number | null;
  rolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
  currentPlayerColor: string;
}

export default function DiceRoller({ value, rolling, canRoll, onRoll, currentPlayerColor }: Props) {
  const [animKey, setAnimKey] = useState(0);

  function handleRoll() {
    if (!canRoll) return;
    setAnimKey(k => k + 1);
    onRoll();
  }

  const displayValue = value ?? 1;
  const dots = DOTS[displayValue] || DOTS[1];

  return (
    <div className={styles.wrapper}>
      {/* Dice face */}
      <button
        id="btn-roll-dice"
        className={`${styles.dice} ${rolling ? styles.rolling : ''} ${canRoll ? styles.rollable : ''}`}
        onClick={handleRoll}
        disabled={!canRoll}
        aria-label={canRoll ? 'Roll dice' : `Dice shows ${displayValue}`}
        style={{ '--player-color': currentPlayerColor } as React.CSSProperties}
        key={animKey}
      >
        <svg viewBox="0 0 100 100" className={styles.diceSvg}>
          <rect x="4" y="4" width="92" height="92" rx="18" ry="18"
            fill="var(--bg-card2)"
            stroke={currentPlayerColor}
            strokeWidth="3"
            className={styles.diceRect}
          />
          {dots.map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r="8"
              fill={currentPlayerColor}
              className={styles.diceDot}
              style={{ filter: `drop-shadow(0 0 4px ${currentPlayerColor})` }}
            />
          ))}
        </svg>
      </button>

      <div className={styles.hint}>
        {canRoll
          ? <span className={styles.tapHint} style={{ color: currentPlayerColor }}>TAP TO ROLL</span>
          : value !== null
            ? <span className={styles.rolled}>Rolled <strong>{value}</strong></span>
            : <span className={styles.waiting}>Waiting…</span>
        }
      </div>
    </div>
  );
}
