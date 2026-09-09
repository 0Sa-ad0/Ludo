'use client';

import { useMemo } from 'react';
import type { GameState, Piece, Player, Point } from '@/lib/types';
import { PLAYER_COLORS } from '@/lib/constants';
import {
  HEX_VIEW, HEX_CX, HEX_CY, HEX_R_GOAL,
  getHexTrack, getHexHomeCols, getHexHomeBases, getHexArms, hexCorner,
  getLoopLen, isOnTrack, pathToTrack, isSafeSquare,
  getValidMoves, startSquares,
} from '@/lib/board';
import styles from './SquareBoard.module.css';

/**
 * Star-shaped board for 5- or 6-player games: a polygonal track ring with one
 * arm per player, home columns running from the track in to the centre goal,
 * and home bases tucked into the wedges between adjacent columns. The arm
 * count follows playerCount directly — 5 players get a true pentagon, 6 get
 * a true hexagon, never a fixed hexagon with an empty arm.
 *
 * All positions come from @/lib/board, where they are derived from the same
 * track indices the rules use — so a column always lands next to the square a
 * piece actually turns in from, rather than being eyeballed.
 */

const CENTER: Point = [HEX_CX, HEX_CY];
const TRACK_R = 15;
const COL_R   = 13;
const BASE_R  = 46;

interface Props {
  gameState: GameState;
  myPlayerIndex: number;
  movingPiece: string | null;
  capturingPiece?: string | null;
  onPieceClick: (pieceId: string) => void;
}

export default function HexBoard({
  gameState, myPlayerIndex, movingPiece, capturingPiece, onPieceClick,
}: Props) {
  const { players, playerCount, currentPlayerIndex, diceValue, diceRolled } = gameState;
  const loopLen = getLoopLen(playerCount);
  const arms = getHexArms(playerCount);
  const HEX_TRACK = useMemo(() => getHexTrack(playerCount), [playerCount]);
  const HEX_HOME_COLS = useMemo(() => getHexHomeCols(playerCount), [playerCount]);
  const HEX_HOME_BASES = useMemo(() => getHexHomeBases(playerCount), [playerCount]);

  const validMoveIds = useMemo(() => {
    if (!diceRolled || currentPlayerIndex !== myPlayerIndex) return new Set<string>();
    const me = players[myPlayerIndex];
    if (!me || me.isFinished) return new Set<string>();
    return new Set(getValidMoves(me, diceValue, gameState));
  }, [diceRolled, currentPlayerIndex, myPlayerIndex, players, diceValue, gameState]);

  function pointFor(piece: Piece, slot: number): Point | null {
    if (piece.status === 'home' || piece.status === 'finished') return null;
    if (isOnTrack(piece.pathPosition, playerCount)) {
      return HEX_TRACK[pathToTrack(piece.pathPosition, slot, playerCount)] ?? null;
    }
    return HEX_HOME_COLS[slot]?.[piece.pathPosition - loopLen] ?? null;
  }

  /** Finished pieces ring the centre in their owner's direction. */
  function goalXY(slot: number, pieceIndex: number): Point {
    const col = HEX_HOME_COLS[slot];
    const a = Math.atan2(col[0][1] - HEX_CY, col[0][0] - HEX_CX);
    const spread = (pieceIndex - 1.5) * 0.13;
    const r = HEX_R_GOAL * 0.62;
    return [
      HEX_CX + r * Math.cos(a + spread),
      HEX_CY + r * Math.sin(a + spread),
    ];
  }

  const stacks = useMemo(() => {
    const map = new Map<string, { piece: Piece; player: Player }[]>();
    for (const player of players) {
      for (const piece of player.pieces) {
        const pt = pointFor(piece, player.slotIndex);
        if (!pt) continue;
        const key = `${Math.round(pt[0])}_${Math.round(pt[1])}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ piece, player });
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, playerCount]);

  const previewPoints = useMemo(() => {
    if (!validMoveIds.size || !diceValue) return [] as Point[];
    const me = players[myPlayerIndex];
    if (!me) return [] as Point[];
    const out: Point[] = [];
    for (const piece of me.pieces) {
      if (!validMoveIds.has(piece.id)) continue;
      const nextPath = piece.status === 'home' ? 0 : piece.pathPosition + diceValue;
      const pt = isOnTrack(nextPath, playerCount)
        ? HEX_TRACK[pathToTrack(nextPath, me.slotIndex, playerCount)]
        : HEX_HOME_COLS[me.slotIndex]?.[nextPath - loopLen];
      if (pt) out.push(pt);
    }
    return out;
  }, [validMoveIds, diceValue, players, myPlayerIndex, playerCount, loopLen, HEX_TRACK, HEX_HOME_COLS]);

  const starts = startSquares(playerCount);
  const hexOutline = Array.from({ length: arms }, (_, k) => hexCorner(k, arms).join(',')).join(' ');

  return (
    <svg
      viewBox={`0 0 ${HEX_VIEW} ${HEX_VIEW}`}
      className={styles.board}
      role="img"
      aria-label={`Hexagonal Ludo board, ${players.length} players`}
      style={{ width: '100%', height: '100%' }}
    >
      <rect x={0} y={0} width={HEX_VIEW} height={HEX_VIEW} fill="#12122a" rx={16} />

      {/* The ring the track actually follows, so the shape reads as a board. */}
      <polygon points={hexOutline} fill="rgba(255,255,255,0.018)"
        stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} />

      {/* ── Home columns (drawn under everything else) ─────────────────── */}
      {Array.from({ length: arms }, (_, slot) => {
        const player = players[slot];
        const color  = player ? PLAYER_COLORS[player.colorIndex].hex : '#3a3a5c';
        const col    = HEX_HOME_COLS[slot];
        const [ex, ey] = HEX_TRACK[(starts[slot] + loopLen - 1) % HEX_TRACK.length];
        return (
          <g key={`col-${slot}`} opacity={player ? 1 : 0.25}>
            {/* Spine linking the entrance square to the goal — this is what
                turns six loose spokes into a legible arm. */}
            <line
              x1={ex} y1={ey} x2={CENTER[0]} y2={CENTER[1]}
              stroke={`${color}44`} strokeWidth={COL_R * 2 + 6} strokeLinecap="round"
            />
            {col.map(([x, y], i) => (
              <circle
                key={i} cx={x} cy={y} r={COL_R}
                fill={`${color}3a`} stroke={`${color}88`} strokeWidth={1}
              />
            ))}
          </g>
        );
      })}

      {/* ── Track ──────────────────────────────────────────────────────── */}
      {HEX_TRACK.map(([x, y], idx) => {
        const startSlot = starts.indexOf(idx);
        const owner = startSlot >= 0 ? players[startSlot] : undefined;
        const tint  = owner ? PLAYER_COLORS[owner.colorIndex].hex : undefined;
        const safe  = isSafeSquare(idx, playerCount);
        return (
          <g key={`t-${idx}`}>
            <circle
              cx={x} cy={y} r={TRACK_R}
              fill={tint ? `${tint}33` : 'rgba(255,255,255,0.08)'}
              stroke={tint ? `${tint}a0` : 'rgba(255,255,255,0.22)'}
              strokeWidth={tint ? 1.5 : 1}
            />
            {safe && startSlot < 0 && (
              // Explicit fill: SVG <text> defaults to black, which is
              // invisible here.
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                fontSize={14} fill="var(--gold, #ffd700)" opacity={0.85}
                style={{ userSelect: 'none' }}>★</text>
            )}
            {startSlot >= 0 && owner && (
              <circle cx={x} cy={y} r={3.5} fill={tint} opacity={0.6} />
            )}
          </g>
        );
      })}

      {/* ── Centre goal ────────────────────────────────────────────────── */}
      <circle cx={HEX_CX} cy={HEX_CY} r={HEX_R_GOAL} fill="#1a1a38"
        stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
      {Array.from({ length: arms }, (_, slot) => {
        const player = players[slot];
        if (!player) return null;
        const col = HEX_HOME_COLS[slot];
        const a = Math.atan2(col[0][1] - HEX_CY, col[0][0] - HEX_CX);
        const color = PLAYER_COLORS[player.colorIndex].hex;
        // A wedge per player so the goal shows who is home.
        const a0 = a - Math.PI / 6, a1 = a + Math.PI / 6;
        const p0 = [HEX_CX + HEX_R_GOAL * Math.cos(a0), HEX_CY + HEX_R_GOAL * Math.sin(a0)];
        const p1 = [HEX_CX + HEX_R_GOAL * Math.cos(a1), HEX_CY + HEX_R_GOAL * Math.sin(a1)];
        return (
          <path
            key={`gw-${slot}`}
            d={`M ${HEX_CX} ${HEX_CY} L ${p0[0]} ${p0[1]} A ${HEX_R_GOAL} ${HEX_R_GOAL} 0 0 1 ${p1[0]} ${p1[1]} Z`}
            fill={color} opacity={0.28}
          />
        );
      })}

      {/* ── Move preview ───────────────────────────────────────────────── */}
      {previewPoints.map(([x, y], i) => (
        <circle key={`prev-${i}`} cx={x} cy={y} r={TRACK_R + 4}
          fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5}
          strokeDasharray="3 3" className={styles.preview} />
      ))}

      {/* ── Home bases ─────────────────────────────────────────────────── */}
      {Array.from({ length: arms }, (_, slot) => {
        const player = players[slot];
        const [bx, by] = HEX_HOME_BASES[slot];
        if (!player) {
          return (
            <g key={`base-${slot}`} opacity={0.28}>
              <circle cx={bx} cy={by} r={BASE_R} fill="rgba(255,255,255,0.02)"
                stroke="rgba(255,255,255,0.1)" strokeWidth={1.2} />
              <text x={bx} y={by} textAnchor="middle" dominantBaseline="central"
                fontSize={11} fill="rgba(255,255,255,0.4)" fontFamily="Orbitron, sans-serif">
                EMPTY
              </text>
            </g>
          );
        }
        const color = PLAYER_COLORS[player.colorIndex];
        const spots: Point[] = [
          [bx - 16, by - 16], [bx + 16, by - 16],
          [bx - 16, by + 16], [bx + 16, by + 16],
        ];
        return (
          <g key={`base-${slot}`}>
            <circle cx={bx} cy={by} r={BASE_R} fill={color.home}
              stroke={color.hex} strokeWidth={1.5} />
            <circle cx={bx} cy={by} r={BASE_R - 9} fill={`${color.hex}14`}
              stroke={`${color.hex}55`} strokeWidth={1} />
            {player.pieces.map((piece, i) => {
              if (piece.status !== 'home') return null;
              const [x, y] = spots[i];
              return (
                <PieceMarker
                  key={piece.id}
                  piece={piece} color={color.hex}
                  x={x} y={y} r={12}
                  isValid={validMoveIds.has(piece.id)}
                  isMoving={piece.id === movingPiece}
                  isCapturing={piece.id === capturingPiece}
                  label={`${player.name} piece ${i + 1}, in home base`}
                  onActivate={onPieceClick}
                />
              );
            })}
          </g>
        );
      })}

      {/* ── Pieces on the board ────────────────────────────────────────── */}
      {Array.from(stacks.values()).flatMap((items) =>
        items.map(({ piece, player }, stackIdx) => {
          const [px, py] = pointFor(piece, player.slotIndex)!;
          const many = items.length > 1;
          const offset = many ? (stackIdx - (items.length - 1) / 2) * 9 : 0;
          const color = PLAYER_COLORS[player.colorIndex];
          return (
            <PieceMarker
              key={piece.id}
              piece={piece} color={color.hex}
              x={px + offset} y={py}
              r={many ? 10 : 13}
              isValid={validMoveIds.has(piece.id)}
              isMoving={piece.id === movingPiece}
              isCapturing={piece.id === capturingPiece}
              isBlock={many && items.every((it) => it.player.slotIndex === player.slotIndex)}
              label={`${player.name} piece ${piece.pieceIndex + 1}`}
              onActivate={onPieceClick}
            />
          );
        })
      )}

      {/* ── Finished pieces ────────────────────────────────────────────── */}
      {players.flatMap((player) =>
        player.pieces
          .filter((p) => p.status === 'finished')
          .map((piece) => {
            const [x, y] = goalXY(player.slotIndex, piece.pieceIndex);
            const color = PLAYER_COLORS[player.colorIndex];
            return (
              <g key={piece.id} data-testid={`piece-${piece.id}`}>
                <circle cx={x} cy={y} r={7} fill={color.hex} stroke="#fff" strokeWidth={1.5}
                  style={{ filter: `drop-shadow(0 0 5px ${color.hex})` }} />
              </g>
            );
          })
      )}

      {/* ── Player name labels, kept inside the ring ───────────────────── */}
      {players.map((player) => {
        const [bx, by] = HEX_HOME_BASES[player.slotIndex];
        const color = PLAYER_COLORS[player.colorIndex];
        return (
          <text
            key={`label-${player.slotIndex}`}
            x={bx} y={by + BASE_R + 14}
            textAnchor="middle" fontSize={12} fill={color.hex}
            fontFamily="Orbitron, sans-serif" fontWeight={700}
            style={{ userSelect: 'none' }}
          >
            {player.name.length > 10 ? `${player.name.slice(0, 9)}…` : player.name}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Piece ───────────────────────────────────────────────────────────────────

interface MarkerProps {
  piece: Piece;
  color: string;
  x: number; y: number; r: number;
  isValid: boolean;
  isMoving: boolean;
  isCapturing?: boolean;
  isBlock?: boolean;
  label: string;
  onActivate: (pieceId: string) => void;
}

function PieceMarker({
  piece, color, x, y, r, isValid, isMoving, isCapturing, isBlock, label, onActivate,
}: MarkerProps) {
  return (
    <g
      data-testid={`piece-${piece.id}`}
      data-valid={isValid}
      role={isValid ? 'button' : undefined}
      tabIndex={isValid ? 0 : undefined}
      aria-label={isValid ? `Move ${label}` : undefined}
      onClick={() => isValid && onActivate(piece.id)}
      onKeyDown={(e) => {
        if (!isValid) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(piece.id); }
      }}
      style={{ cursor: isValid ? 'pointer' : 'default', outline: 'none' }}
      className={`${isMoving ? styles.movingPiece : ''} ${isCapturing ? styles.captureFlash : ''}`}
    >
      {isValid && (
        <circle cx={x} cy={y} r={r + 6} fill="rgba(255,255,255,0.1)"
          stroke={color} strokeWidth={2} className={styles.validGlow} />
      )}
      <circle cx={x} cy={y} r={r} fill={color} stroke="#fff" strokeWidth={2}
        className={styles.pieceCircle}
        style={{ filter: `drop-shadow(0 0 ${isValid ? 9 : 4}px ${color})` }} />
      {isBlock && (
        <circle cx={x} cy={y} r={r - 4} fill="none" stroke="#fff" strokeWidth={1.2} opacity={0.8} />
      )}
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fontSize={r > 11 ? 10 : 9} fill="#0d0d1a" fontWeight="bold"
        className={styles.pieceCircle}
        style={{ userSelect: 'none', pointerEvents: 'none' }}>
        {piece.pieceIndex + 1}
      </text>
    </g>
  );
}
