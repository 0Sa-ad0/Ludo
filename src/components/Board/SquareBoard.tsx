'use client';

import { useMemo } from 'react';
import type { GameState, Piece, Player, Point, WalkJob } from '@/lib/types';
import { PLAYER_COLORS } from '@/lib/constants';
import {
  SQUARE_CELL as CELL, SQUARE_SIZE as SIZE,
  SQUARE_TRACK, SQUARE_HOME_COLS, SQUARE_HOME_QUADRANTS,
  getLoopLen, isOnTrack, pathToTrack, isSafeSquare,
  getValidMoves, squareArm, wouldCaptureAt,
} from '@/lib/board';
import { useWalkAnimation } from '@/lib/useWalkAnimation';
import styles from './SquareBoard.module.css';

/**
 * The classic 15×15 Ludo board for 2–4 players, drawn as SVG so it scales to
 * any screen without reflowing.
 *
 * All coordinates come from @/lib/board — the same module the server uses to
 * decide where a piece actually is, so the drawing can't drift from the rules.
 */

const CENTER: Point = [7.5 * CELL, 7.5 * CELL];   // middle of the 3×3 goal block
const GOAL_MIN = 6 * CELL;
const GOAL_MAX = 9 * CELL;

/** Which way each player's goal triangle points, matching their home column. */
const GOAL_DIRS: Point[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];

const cellXY = ([r, c]: Point): Point => [c * CELL + CELL / 2, r * CELL + CELL / 2];

interface Props {
  gameState: GameState;
  myPlayerIndex: number;
  /** True once the dice's own roll animation has actually landed — gates the
   *  move preview so it never appears before the number does. */
  diceSettled: boolean;
  /** Real slotIndex of whoever's turn it is, so their home base can glow. */
  highlightSlot: number;
  walkBatch: { id: number; jobs: WalkJob[] } | null;
  capturingPieces: Set<string>;
  onPieceClick: (pieceId: string) => void;
}

export default function SquareBoard({
  gameState, myPlayerIndex, diceSettled, highlightSlot, walkBatch, capturingPieces, onPieceClick,
}: Props) {
  const { players, playerCount, currentPlayerIndex, diceValue, diceRolled } = gameState;
  const loopLen = getLoopLen(playerCount);

  /**
   * Maps a player's real slotIndex to the quadrant it's actually DRAWN in
   * (0=bottom-left, 1=top-left, 2=top-right, 3=bottom-right) — purely a
   * display transform. Two rules:
   *
   *  1. The viewer's own slot always maps to 0 (bottom-left) — you always
   *     see your own base nearest you, whether you're the host or joined
   *     later.
   *  2. With exactly 2 players, the other slot maps to 2 (top-right), not 1
   *     — opponents sit diagonally across the board, not side by side.
   *     For 3–4 players it's a plain rotation that preserves everyone's
   *     relative (turn) order around the board.
   *
   * `squareArm` (from rules.js — the same function the server uses to place
   * pieces on the track) is the single source of truth for which arm a slot
   * REALLY occupies; this only rotates that real arm to sit at 0 for the
   * viewer. Because both the real game state and this display transform go
   * through the same `squareArm`, the mapping is a genuine rotation — two
   * pieces can only ever render on the same cell if they're really on the
   * same square. (An earlier version used a display-only remap that didn't
   * match the real geometry, which could draw two pieces as if they'd
   * collided when they hadn't — see squareArm's own comment for why that's
   * unsafe.)
   */
  const visualSlot = useMemo(() => {
    const viewerArm = myPlayerIndex >= 0 ? squareArm(myPlayerIndex, playerCount) : 0;
    return (realSlot: number) => (squareArm(realSlot, playerCount) - viewerArm + 4) % 4;
  }, [playerCount, myPlayerIndex]);

  // The server is the authority; this only decides what to highlight, so it
  // calls the very same rule function rather than re-deriving it. Gated on
  // diceSettled too — otherwise the preview could flash up before the dice
  // has visibly finished landing on its number.
  const validMoveIds = useMemo(() => {
    if (!diceRolled || !diceSettled || currentPlayerIndex !== myPlayerIndex) return new Set<string>();
    const me = players[myPlayerIndex];
    if (!me || me.isFinished) return new Set<string>();
    return new Set(getValidMoves(me, diceValue, gameState));
  }, [diceRolled, diceSettled, currentPlayerIndex, myPlayerIndex, players, diceValue, gameState]);

  /** Where a piece sits right now (in display space), or null while it is
   *  still in the home base. `slot` is the player's REAL slotIndex — this
   *  looks up the visually-rotated position for it. */
  function cellFor(piece: Piece, slot: number): Point | null {
    if (piece.status === 'home') return null;
    if (piece.status === 'finished') return null;   // parked in the goal instead
    const vSlot = visualSlot(slot);
    if (isOnTrack(piece.pathPosition, playerCount)) {
      return SQUARE_TRACK[pathToTrack(piece.pathPosition, vSlot, playerCount)] ?? null;
    }
    return SQUARE_HOME_COLS[vSlot]?.[piece.pathPosition - loopLen] ?? null;
  }

  /** Same lookup as cellFor, but from a bare pathPosition rather than a full
   *  Piece — what the box-by-box walk animation steps through. */
  function coordForPath(playerIndex: number, pathPos: number): Point | null {
    if (pathPos < 0) return null;
    const vSlot = visualSlot(playerIndex);
    const cell = isOnTrack(pathPos, playerCount)
      ? SQUARE_TRACK[pathToTrack(pathPos, vSlot, playerCount)]
      : SQUARE_HOME_COLS[vSlot]?.[pathPos - loopLen];
    return cell ? cellXY(cell) : null;
  }

  /** A player's four home-base parking spots, in pixel space. */
  function homeBaseSpots(slot: number): Point[] {
    const [qr, qc] = SQUARE_HOME_QUADRANTS[visualSlot(slot)] ?? [0, 0];
    return [
      [qc * CELL + 1.8 * CELL, qr * CELL + 1.8 * CELL],
      [qc * CELL + 4.2 * CELL, qr * CELL + 1.8 * CELL],
      [qc * CELL + 1.8 * CELL, qr * CELL + 4.2 * CELL],
      [qc * CELL + 4.2 * CELL, qr * CELL + 4.2 * CELL],
    ];
  }

  const walking = useWalkAnimation(walkBatch, {
    resolveXY: coordForPath,
    homeBaseXY: (playerIndex, pieceIndex) => homeBaseSpots(playerIndex)[pieceIndex],
  });

  /** Resting place for a finished piece, inside its owner's goal triangle
   *  (display space — `slot` is the REAL slotIndex). */
  function goalXY(slot: number, pieceIndex: number): Point {
    const [dx, dy] = GOAL_DIRS[visualSlot(slot)] ?? [0, 0];
    const spread = (pieceIndex - 1.5) * 11;
    return [
      CENTER[0] + dx * CELL * 0.78 - dy * spread,
      CENTER[1] + dy * CELL * 0.78 + dx * spread,
    ];
  }

  // Group everything on the board by cell, so pieces sharing a square fan out
  // instead of hiding one another. Pieces currently walking are excluded —
  // they render separately, at their animated position, until the walk lands.
  const stacks = useMemo(() => {
    const map = new Map<string, { piece: Piece; player: Player }[]>();
    for (const player of players) {
      for (const piece of player.pieces) {
        if (walking.has(piece.id)) continue;
        const cell = cellFor(piece, player.slotIndex);
        if (!cell) continue;
        const key = `${cell[0]}_${cell[1]}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ piece, player });
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, playerCount, visualSlot, walking]);

  /** Target square preview for the piece the player is about to move — and
   *  whether that square would actually capture an opponent, so the preview
   *  can look different for "step" versus "cut". */
  const previewCells = useMemo(() => {
    if (!validMoveIds.size || !diceValue) return [] as { cell: Point; capture: boolean }[];
    const me = players[myPlayerIndex];
    if (!me) return [] as { cell: Point; capture: boolean }[];
    const myVisual = visualSlot(me.slotIndex);
    const out: { cell: Point; capture: boolean }[] = [];
    for (const piece of me.pieces) {
      if (!validMoveIds.has(piece.id)) continue;
      const nextPath = piece.status === 'home' ? 0 : piece.pathPosition + diceValue;
      const onTrack = isOnTrack(nextPath, playerCount);
      const cell = onTrack
        ? SQUARE_TRACK[pathToTrack(nextPath, myVisual, playerCount)]
        : SQUARE_HOME_COLS[myVisual]?.[nextPath - loopLen];
      if (!cell) continue;
      const capture = onTrack && wouldCaptureAt(pathToTrack(nextPath, me.slotIndex, playerCount), me.slotIndex, players, playerCount);
      out.push({ cell, capture });
    }
    return out;
  }, [validMoveIds, diceValue, players, myPlayerIndex, playerCount, loopLen, visualSlot]);

  // Real start-track-index -> owning player, but keyed by where that start
  // square is actually DRAWN (post-rotation), not the player's real slot.
  const displayStartOwner = useMemo(() => {
    const map = new Map<number, Player>();
    for (const player of players) {
      map.set(pathToTrack(0, visualSlot(player.slotIndex), playerCount), player);
    }
    return map;
  }, [players, playerCount, visualSlot]);

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={styles.board}
      role="img"
      aria-label={`Ludo board, ${players.length} players`}
      style={{ width: '100%', height: '100%' }}
    >
      <rect x={0} y={0} width={SIZE} height={SIZE} fill="#12122a" rx={16} />

      {/* ── Home quadrants ─────────────────────────────────────────────── */}
      {SQUARE_HOME_QUADRANTS.map(([qr, qc], slot) => {
        const player = players.find((p) => visualSlot(p.slotIndex) === slot);
        const color  = player ? PLAYER_COLORS[player.colorIndex] : null;
        const x = qc * CELL, y = qr * CELL;
        const isTurn = !!player && player.slotIndex === highlightSlot;
        // Left-half quadrants (qc === 0) anchor their name bottom-left;
        // right-half ones (qc === 9) anchor it bottom-right — always toward
        // the board's outer edge, never crowding the centre.
        const onLeft = qc === 0;
        return (
          <g key={`quad-${slot}`} opacity={player ? 1 : 0.25}>
            <rect
              x={x} y={y} width={6 * CELL} height={6 * CELL}
              fill={color ? color.home : 'rgba(255,255,255,0.02)'}
              stroke={color ? color.hex : 'rgba(255,255,255,0.08)'}
              strokeWidth={isTurn ? 3 : 1.5}
              className={isTurn ? styles.turnGlow : undefined}
              style={isTurn && color ? { filter: `drop-shadow(0 0 10px ${color.hex})` } : undefined}
              rx={10}
            />
            <rect
              x={x + CELL} y={y + CELL} width={4 * CELL} height={4 * CELL}
              fill={color ? `${color.hex}18` : 'transparent'}
              stroke={color ? `${color.hex}66` : 'rgba(255,255,255,0.06)'}
              strokeWidth={1}
              rx={8}
            />
            {player && (
              <text
                x={onLeft ? x + 0.35 * CELL : x + 5.65 * CELL}
                y={y + 5.65 * CELL}
                textAnchor={onLeft ? 'start' : 'end'}
                fontSize={13} fill={color ? color.hex : '#fff'}
                fontFamily="Orbitron, sans-serif" fontWeight={700}
                style={{ userSelect: 'none' }}
              >
                {player.name.length > 12 ? `${player.name.slice(0, 11)}…` : player.name}
              </text>
            )}
            {!player && (
              <text
                x={x + 3 * CELL} y={y + 3 * CELL}
                textAnchor="middle" dominantBaseline="central"
                fontSize={13} fill="rgba(255,255,255,0.3)"
                fontFamily="Orbitron, sans-serif"
              >
                EMPTY
              </text>
            )}
          </g>
        );
      })}

      {/* ── Track squares ──────────────────────────────────────────────── */}
      {SQUARE_TRACK.map((cell, idx) => {
        const [r, c] = cell;
        const owner = displayStartOwner.get(idx);
        const isStart = !!owner;
        const tint  = owner ? PLAYER_COLORS[owner.colorIndex].hex : undefined;
        const safe  = isSafeSquare(idx, playerCount);
        return (
          <g key={`t-${idx}`}>
            <rect
              x={c * CELL + 1.5} y={r * CELL + 1.5}
              width={CELL - 3} height={CELL - 3}
              fill={tint ? `${tint}2e` : 'rgba(255,255,255,0.07)'}
              stroke={tint ? `${tint}90` : 'rgba(255,255,255,0.2)'}
              strokeWidth={tint ? 1.3 : 0.9}
              rx={3}
            />
            {safe && !isStart && (
              // SVG <text> defaults to fill:black — without an explicit fill
              // these stars were invisible against the dark board.
              <text
                x={c * CELL + CELL / 2} y={r * CELL + CELL / 2}
                textAnchor="middle" dominantBaseline="central"
                fontSize={17} fill="var(--gold, #ffd700)" opacity={0.8}
                style={{ userSelect: 'none' }}
              >
                ★
              </text>
            )}
            {isStart && owner && (
              <circle
                cx={c * CELL + CELL / 2} cy={r * CELL + CELL / 2} r={4}
                fill={tint} opacity={0.55}
              />
            )}
          </g>
        );
      })}

      {/* ── Home columns ───────────────────────────────────────────────── */}
      {SQUARE_HOME_COLS.map((col, slot) => {
        const player = players.find((p) => visualSlot(p.slotIndex) === slot);
        if (!player) return null;
        const color = PLAYER_COLORS[player.colorIndex];
        return col.map(([r, c], i) => (
          <rect
            key={`hc-${slot}-${i}`}
            x={c * CELL + 1.5} y={r * CELL + 1.5}
            width={CELL - 3} height={CELL - 3}
            fill={`${color.hex}33`}
            stroke={`${color.hex}70`}
            strokeWidth={0.8}
            rx={3}
          />
        ));
      })}

      {/* ── Centre goal: four triangles meeting in the middle ──────────── */}
      <g>
        {[0, 1, 2, 3].map((slot) => {
          const player = players.find((p) => visualSlot(p.slotIndex) === slot);
          const color = player ? PLAYER_COLORS[player.colorIndex].hex : '#333355';
          const corners: Record<number, string> = {
            0: `${GOAL_MIN},${GOAL_MAX} ${GOAL_MAX},${GOAL_MAX}`,
            1: `${GOAL_MIN},${GOAL_MIN} ${GOAL_MIN},${GOAL_MAX}`,
            2: `${GOAL_MIN},${GOAL_MIN} ${GOAL_MAX},${GOAL_MIN}`,
            3: `${GOAL_MAX},${GOAL_MIN} ${GOAL_MAX},${GOAL_MAX}`,
          };
          return (
            <polygon
              key={`goal-${slot}`}
              points={`${corners[slot]} ${CENTER[0]},${CENTER[1]}`}
              fill={color}
              opacity={player ? 0.3 : 0.12}
              stroke={player ? `${color}90` : 'rgba(255,255,255,0.08)'}
              strokeWidth={1}
            />
          );
        })}
      </g>

      {/* ── Move preview ───────────────────────────────────────────────── */}
      {previewCells.map(({ cell, capture }, i) => {
        const [x, y] = cellXY(cell);
        return (
          <circle
            key={`prev-${i}`} cx={x} cy={y} r={CELL * 0.42}
            fill="none"
            stroke={capture ? '#ff2d4a' : 'rgba(255,255,255,0.55)'}
            strokeWidth={capture ? 2.2 : 1.5} strokeDasharray="3 3"
            className={capture ? styles.previewCapture : styles.preview}
          />
        );
      })}

      {/* ── Pieces waiting in their home base ──────────────────────────── */}
      {players.map((player) => {
        const spots = homeBaseSpots(player.slotIndex);
        const color = PLAYER_COLORS[player.colorIndex];
        return player.pieces.map((piece, i) => {
          // Only draw a marker for a piece that is genuinely still at home —
          // drawing all four unconditionally used to leave empty duplicate
          // nodes with the same test id as the piece out on the track.
          // A piece still mid-walk into home renders in the walking overlay
          // below instead, so it doesn't just pop in here before landing.
          if (piece.status !== 'home' || walking.has(piece.id)) return null;
          const [x, y] = spots[i];
          return (
            <PieceMarker
              key={piece.id}
              piece={piece}
              color={color.hex}
              x={x} y={y} r={14}
              isValid={validMoveIds.has(piece.id)}
              isCapturing={capturingPieces.has(piece.id)}
              label={`${player.name} piece ${i + 1}, in home base`}
              onActivate={onPieceClick}
            />
          );
        });
      })}

      {/* ── Pieces on the board ────────────────────────────────────────── */}
      {Array.from(stacks.values()).flatMap((items) =>
        items.map(({ piece, player }, stackIdx) => {
          const cell = cellFor(piece, player.slotIndex)!;
          const [bx, by] = cellXY(cell);
          const many = items.length > 1;
          const offset = many ? (stackIdx - (items.length - 1) / 2) * 9 : 0;
          const color = PLAYER_COLORS[player.colorIndex];
          return (
            <PieceMarker
              key={piece.id}
              piece={piece}
              color={color.hex}
              x={bx + offset} y={by}
              r={many ? 11 : 14}
              isValid={validMoveIds.has(piece.id)}
              isCapturing={capturingPieces.has(piece.id)}
              isBlock={many && items.every((it) => it.player.slotIndex === player.slotIndex)}
              label={`${player.name} piece ${piece.pieceIndex + 1}`}
              onActivate={onPieceClick}
            />
          );
        })
      )}

      {/* ── Pieces mid-walk (box-by-box, forward or back to home) ───────── */}
      {Array.from(walking.entries()).map(([pieceId, { xy, stepMs }]) => {
        const player = players.find((p) => p.pieces.some((pc) => pc.id === pieceId));
        const piece = player?.pieces.find((pc) => pc.id === pieceId);
        if (!player || !piece) return null;
        const color = PLAYER_COLORS[player.colorIndex];
        return (
          <PieceMarker
            key={`walk-${pieceId}`}
            piece={piece}
            color={color.hex}
            x={xy[0]} y={xy[1]} r={14}
            isValid={false}
            isCapturing={capturingPieces.has(pieceId)}
            transitionMs={stepMs}
            label={`${player.name} piece ${piece.pieceIndex + 1}`}
            onActivate={onPieceClick}
          />
        );
      })}

      {/* ── Finished pieces, parked in the goal ────────────────────────── */}
      {players.flatMap((player) =>
        player.pieces
          .filter((p) => p.status === 'finished' && !walking.has(p.id))
          .map((piece) => {
            const [x, y] = goalXY(player.slotIndex, piece.pieceIndex);
            const color = PLAYER_COLORS[player.colorIndex];
            return (
              <g key={piece.id} data-testid={`piece-${piece.id}`}>
                <circle cx={x} cy={y} r={8} fill={color.hex} stroke="#fff" strokeWidth={1.5}
                  style={{ filter: `drop-shadow(0 0 5px ${color.hex})` }} />
              </g>
            );
          })
      )}
    </svg>
  );
}

// ─── Piece ───────────────────────────────────────────────────────────────────

interface MarkerProps {
  piece: Piece;
  color: string;
  x: number; y: number; r: number;
  isValid: boolean;
  isCapturing?: boolean;
  isBlock?: boolean;
  /** Per-square walk transition time, while this marker is mid-walk. */
  transitionMs?: number;
  label: string;
  onActivate: (pieceId: string) => void;
}

function PieceMarker({
  piece, color, x, y, r, isValid, isCapturing, isBlock, transitionMs, label, onActivate,
}: MarkerProps) {
  const posStyle = transitionMs != null ? { transitionDuration: `${transitionMs}ms` } : undefined;
  return (
    <g
      data-testid={`piece-${piece.id}`}
      data-valid={isValid}
      // Keyboard-reachable when actionable: the board used to be pointer-only.
      role={isValid ? 'button' : undefined}
      tabIndex={isValid ? 0 : undefined}
      aria-label={isValid ? `Move ${label}` : undefined}
      onClick={() => isValid && onActivate(piece.id)}
      onKeyDown={(e) => {
        if (!isValid) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(piece.id); }
      }}
      style={{ cursor: isValid ? 'pointer' : 'default', outline: 'none' }}
      className={isCapturing ? styles.captureFlash : undefined}
    >
      {isValid && (
        <circle cx={x} cy={y} r={r + 6} fill="rgba(255,255,255,0.1)"
          stroke={color} strokeWidth={2} className={styles.validGlow} />
      )}
      <circle
        cx={x} cy={y} r={r}
        fill={color} stroke="#fff" strokeWidth={2}
        className={styles.pieceCircle}
        style={{ ...posStyle, filter: `drop-shadow(0 0 ${isValid ? 10 : 4}px ${color})` }}
      />
      {isBlock && (
        <circle cx={x} cy={y} r={r - 4} fill="none" stroke="#fff" strokeWidth={1.2} opacity={0.8} />
      )}
      <text
        x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fontSize={r > 12 ? 11 : 9} fill="#0d0d1a" fontWeight="bold"
        className={styles.pieceCircle}
        style={{ ...posStyle, userSelect: 'none', pointerEvents: 'none' }}
      >
        {piece.pieceIndex + 1}
      </text>
    </g>
  );
}
