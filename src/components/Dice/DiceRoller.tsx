'use client';

import { useEffect, useState } from 'react';
import styles from './DiceRoller.module.css';

// ── Dot positions for standard 100x100 face (and 60x60 cube faces) ──────────
const DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
};

interface Props {
  value: number | null;
  rolling: boolean;
  canRoll: boolean;
  waitingForMove?: boolean;
  onRoll: () => void;
  currentPlayerColor: string;
  forcedMove?: { playerName: string; deadline: number } | null;
}

/** Render a single die face on the 3D rolling cube */
function CubeFace({ n, color }: { n: number; color: string }) {
  const dots = DOTS[n] ?? DOTS[1];
  const dotR = n === 1 ? 5.5 : 4;
  return (
    <svg viewBox="0 0 60 60" className={styles.cubeFaceSvg} aria-hidden>
      <rect
        x={1.5} y={1.5} width={57} height={57} rx={12}
        fill="#14142b"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.7}
      />
      {dots.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx * 0.6}
          cy={cy * 0.6}
          r={dotR}
          fill={color}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
      ))}
    </svg>
  );
}

export default function DiceRoller({
  value,
  rolling,
  canRoll,
  waitingForMove,
  onRoll,
  currentPlayerColor,
  forcedMove,
}: Props) {
  // Countdown ring for forced moves
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

  const RING_R = 50;
  const RING_C = 2 * Math.PI * RING_R;

  const idle = !rolling && value === null;
  const dots = value !== null ? (DOTS[value] ?? []) : [];

  return (
    <div className={styles.wrapper}>
      <button
        id="btn-roll-dice"
        data-value={value ?? ''}
        data-can-roll={canRoll}
        data-rolling={rolling}
        className={`${styles.diceBtn} ${canRoll && !rolling ? styles.rollable : ''} ${rolling ? styles.rolling : ''}`}
        onClick={onRoll}
        disabled={!canRoll || rolling}
        aria-label={canRoll ? 'Roll dice' : value !== null ? `Dice shows ${value}` : 'Dice'}
        aria-live="polite"
        style={{ '--player-color': currentPlayerColor } as React.CSSProperties}
      >
        {/* Forced move countdown ring — only after dice lands */}
        {!rolling && forcedMove && (
          <svg viewBox="0 0 108 108" className={styles.countdownRing} aria-hidden>
            <circle
              cx={54}
              cy={54}
              r={RING_R}
              fill="none"
              stroke={currentPlayerColor}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - remainingFrac)}
              transform="rotate(-90 54 54)"
              style={{ filter: `drop-shadow(0 0 6px ${currentPlayerColor})` }}
            />
          </svg>
        )}

        {rolling ? (
          /* ── 3D ROLLING TUMBLE ANIMATION (ONLY DURING ACTIVE ROLL) ── */
          <div className={styles.tumbleScene} aria-hidden>
            <div className={styles.diceShadow} />
            <div className={styles.cube}>
              {/* Authentic opposite-sum-to-7 layout */}
              <div className={`${styles.face} ${styles.front}`}>
                <CubeFace n={1} color={currentPlayerColor} />
              </div>
              <div className={`${styles.face} ${styles.back}`}>
                <CubeFace n={6} color={currentPlayerColor} />
              </div>
              <div className={`${styles.face} ${styles.right}`}>
                <CubeFace n={2} color={currentPlayerColor} />
              </div>
              <div className={`${styles.face} ${styles.left}`}>
                <CubeFace n={5} color={currentPlayerColor} />
              </div>
              <div className={`${styles.face} ${styles.top}`}>
                <CubeFace n={3} color={currentPlayerColor} />
              </div>
              <div className={`${styles.face} ${styles.bottom}`}>
                <CubeFace n={4} color={currentPlayerColor} />
              </div>
            </div>
          </div>
        ) : (
          /* ── FLAT SVG DICE (IDLE, READY, AND SETTLED STATES — AS LIKE BEFORE) ── */
          <svg
            viewBox="0 0 100 100"
            className={`${styles.diceSvg} ${value !== null ? styles.settled : ''}`}
            aria-hidden
          >
            {/* Dark rounded rectangle with neon glow stroke */}
            <rect
              x={4}
              y={4}
              width={92}
              height={92}
              rx={18}
              fill="var(--bg-card2, #1a1a38)"
              stroke={currentPlayerColor}
              strokeWidth={3}
              style={{ filter: `drop-shadow(0 0 8px ${currentPlayerColor})` }}
            />
            {idle ? (
              /* Initial state: clean 🎲 emoji before roll */
              <text
                x={50}
                y={54}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={44}
              >
                🎲
              </text>
            ) : (
              /* Settled state: glowing dots for rolled value */
              dots.map(([cx, cy], i) => (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={value === 1 ? 10 : 8}
                  fill={currentPlayerColor}
                  style={{ filter: `drop-shadow(0 0 5px ${currentPlayerColor})` }}
                />
              ))
            )}
          </svg>
        )}
      </button>

      <div className={styles.hint}>
        {rolling ? (
          <span className={styles.rollingHint} style={{ color: currentPlayerColor }}>
            Rolling…
          </span>
        ) : forcedMove ? (
          <span className={styles.tapHint} style={{ color: currentPlayerColor }}>
            {forcedMove.playerName} — only move, auto-playing…
          </span>
        ) : canRoll ? (
          <span className={styles.tapHint} style={{ color: currentPlayerColor }}>
            TAP TO ROLL
          </span>
        ) : waitingForMove ? (
          <span className={styles.tapHint} style={{ color: currentPlayerColor }}>
            PICK A PIECE {value !== null && `· ${value}`}
          </span>
        ) : value !== null ? (
          <span className={styles.rolled}>
            Rolled <strong>{value}</strong>
          </span>
        ) : (
          <span className={styles.waiting}>Waiting…</span>
        )}
      </div>
    </div>
  );
}
