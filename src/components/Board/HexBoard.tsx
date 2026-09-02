'use client';

import type { GameState } from '@/lib/types';
import { PLAYER_COLORS, HOME_COLUMN_LENGTH } from '@/lib/constants';
import styles from './SquareBoard.module.css';

/**
 * Hexagonal Ludo Board for 5–6 players.
 * Uses an SVG hexagonal star shape with 6 arms.
 * Each arm has: home base area, 10 track squares, home column (5 squares).
 * Main track: 60 squares (10 per arm × 6).
 */

const HEX_TRACK_LEN = 60;
const ARM_LEN       = 10;
const COL_LEN       = 5;
const TOTAL_PATH    = HEX_TRACK_LEN + COL_LEN;

// SVG viewbox
const VW = 700;
const VH = 700;
const CX = VW / 2;
const CY = VH / 2;
const R_OUTER  = 300; // outer radius of hex track
const R_INNER  = 160; // inner radius (start of home columns)
const R_HOME   = 320; // home base radius

// Generate positions for 60 track squares around a hexagon
function hexTrackPositions(): [number, number][] {
  return Array.from({ length: HEX_TRACK_LEN }, (_, i) => {
    const angle = (i / HEX_TRACK_LEN) * 2 * Math.PI - Math.PI / 2;
    const r = R_OUTER - 20;
    return [
      CX + r * Math.cos(angle),
      CY + r * Math.sin(angle),
    ];
  });
}

// Generate home column squares for each player
function homeColPositions(playerIndex: number): [number, number][] {
  const angle = (playerIndex / 6) * 2 * Math.PI - Math.PI / 2;
  const positions: [number, number][] = [];
  for (let i = 0; i < COL_LEN; i++) {
    const r = R_INNER - i * ((R_INNER - 30) / COL_LEN);
    positions.push([CX + r * Math.cos(angle), CY + r * Math.sin(angle)]);
  }
  return positions;
}

// Home base position for each player
function homeBaseCenter(playerIndex: number): [number, number] {
  const angle = (playerIndex / 6) * 2 * Math.PI - Math.PI / 2;
  return [CX + R_HOME * Math.cos(angle), CY + R_HOME * Math.sin(angle)];
}

const TRACK_POS = hexTrackPositions();
const HOME_COL_POSITIONS = Array.from({ length: 6 }, (_, i) => homeColPositions(i));
const START_SQUARES = [0, 10, 20, 30, 40, 50];
const SAFE_HEX = new Set([0, 8, 10, 18, 20, 28, 30, 38, 40, 48, 50, 58]);

interface Props {
  gameState: GameState;
  myPlayerIndex: number;
  movingPiece: string | null;
  onPieceClick: (pieceId: string) => void;
}

export default function HexBoard({ gameState, myPlayerIndex, movingPiece, onPieceClick }: Props) {
  const { players, currentPlayerIndex, diceValue, diceRolled } = gameState;

  const validMoveIds = (() => {
    if (!diceRolled || currentPlayerIndex !== myPlayerIndex) return new Set<string>();
    const player = players[myPlayerIndex];
    if (!player) return new Set<string>();
    const valid = new Set<string>();
    player.pieces.forEach(p => {
      if (p.status === 'finished') return;
      if (p.status === 'home' && diceValue === 6) valid.add(p.id);
      if (p.status === 'active' && p.pathPosition + (diceValue ?? 0) <= TOTAL_PATH) valid.add(p.id);
    });
    return valid;
  })();

  function getPieceXY(piece: { status: string; pathPosition: number; playerIndex: number }): [number, number] | null {
    const pi = piece.playerIndex;
    if (piece.status === 'finished') return [CX, CY];
    if (piece.status === 'home') return null;
    const pp = piece.pathPosition;
    if (pp < HEX_TRACK_LEN) {
      const startIdx = START_SQUARES[pi] ?? 0;
      const trackIdx = (startIdx + pp) % HEX_TRACK_LEN;
      return TRACK_POS[trackIdx] ?? null;
    }
    return HOME_COL_POSITIONS[pi]?.[pp - HEX_TRACK_LEN] ?? null;
  }

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className={styles.board}
      style={{ width: '100%', height: '100%' }}
      aria-label="Hexagonal Ludo board">

      {/* Background */}
      <circle cx={CX} cy={CY} r={350} fill="#12122a" />
      <circle cx={CX} cy={CY} r={350} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

      {/* Hex track squares */}
      {TRACK_POS.map(([x, y], i) => {
        const isSafe = SAFE_HEX.has(i);
        const startPi = START_SQUARES.indexOf(i);
        const color = startPi >= 0 ? PLAYER_COLORS[players[startPi]?.colorIndex ?? startPi]?.hex : undefined;
        return (
          <g key={`hex-track-${i}`}>
            <circle cx={x} cy={y} r={16}
              fill={color ? `${color}22` : 'rgba(255,255,255,0.04)'}
              stroke={color ? `${color}60` : 'rgba(255,255,255,0.12)'}
              strokeWidth="1"
            />
            {isSafe && <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="12" style={{userSelect:'none'}}>⭐</text>}
          </g>
        );
      })}

      {/* Home columns */}
      {players.map((player, pi) => {
        const color = PLAYER_COLORS[player.colorIndex];
        return HOME_COL_POSITIONS[pi]?.map(([x, y], ci) => (
          <circle key={`hcol-${pi}-${ci}`} cx={x} cy={y} r={14}
            fill={`${color.hex}25`} stroke={`${color.hex}70`} strokeWidth="1" />
        ));
      })}

      {/* Center goal */}
      <circle cx={CX} cy={CY} r={36} fill="#1a1a38" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fontSize="28" style={{userSelect:'none'}}>⭐</text>

      {/* Home bases */}
      {players.map((player, pi) => {
        const color = PLAYER_COLORS[player.colorIndex];
        const [bx, by] = homeBaseCenter(pi);
        return (
          <g key={`home-base-${pi}`}>
            <circle cx={bx} cy={by} r={45} fill={color.home} stroke={color.hex} strokeWidth="1.5" opacity="0.85" />
            <circle cx={bx} cy={by} r={35} fill={`${color.hex}15`} stroke={`${color.hex}50`} strokeWidth="1" rx="8" />
            {/* Home pieces */}
            {[[-14,-14],[14,-14],[-14,14],[14,14]].map(([dx,dy], idx) => {
              const piece = player.pieces[idx];
              if (!piece || piece.status !== 'home') return null;
              const isValid = validMoveIds.has(piece.id);
              return (
                <g key={idx} onClick={() => isValid && onPieceClick(piece.id)} style={{cursor: isValid ? 'pointer' : 'default'}}>
                  {isValid && <circle cx={bx+dx} cy={by+dy} r={16} fill="rgba(255,255,255,0.1)" stroke={color.hex} strokeWidth="2" className={styles.validGlow} />}
                  <circle cx={bx+dx} cy={by+dy} r={12} fill={color.hex} stroke="#fff" strokeWidth="2"
                    style={{filter:`drop-shadow(0 0 5px ${color.hex})`}}
                    className={piece.id === movingPiece ? styles.movingPiece : ''}
                  />
                </g>
              );
            })}
            {/* Player label */}
            <text x={bx} y={by + 54} textAnchor="middle" fontSize="10" fill={color.hex}
              fontFamily="Orbitron, sans-serif" fontWeight="700" style={{userSelect:'none'}}>
              {player.name.substring(0,8)}
            </text>
          </g>
        );
      })}

      {/* Active pieces */}
      {players.flatMap((player) =>
        player.pieces.map((piece) => {
          if (piece.status === 'home') return null;
          const pos = getPieceXY({ status: piece.status, pathPosition: piece.pathPosition, playerIndex: player.slotIndex });
          if (!pos) return null;
          const [px, py] = pos;
          const color = PLAYER_COLORS[player.colorIndex];
          const isValid = validMoveIds.has(piece.id);
          return (
            <g key={piece.id} onClick={() => isValid && onPieceClick(piece.id)} style={{cursor: isValid ? 'pointer' : 'default'}}
              className={piece.id === movingPiece ? styles.movingPiece : ''}>
              {isValid && <circle cx={px} cy={py} r={20} fill="rgba(255,255,255,0.1)" stroke={color.hex} strokeWidth="2" className={styles.validGlow} />}
              <circle cx={px} cy={py} r={13} fill={color.hex} stroke="#fff" strokeWidth="2"
                style={{filter:`drop-shadow(0 0 ${isValid?8:4}px ${color.hex})`}} />
              <text x={px} y={py} textAnchor="middle" dominantBaseline="central" fontSize="10" fill="#000" fontWeight="bold" style={{userSelect:'none',pointerEvents:'none'}}>
                {piece.pieceIndex+1}
              </text>
            </g>
          );
        })
      )}
    </svg>
  );
}
