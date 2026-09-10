/**
 * Typed view over the shared rules module.
 *
 * rules.js is plain CommonJS because server.js has to require it, so TypeScript
 * only infers loose `number[][]` shapes from it. This module re-exports the
 * same values with the tuple types the components actually want, and is the
 * only place that needs to know rules.js is JavaScript.
 */
import * as rules from './rules';
import type { Point, Piece, Player } from './types';

export const {
  PIECES_PER_PLAYER,
  HOME_COLUMN_LEN,
  MIN_PLAYERS,
  MAX_PLAYERS,
  SQUARE_TRACK_LEN,
  SQUARE_GRID,
  SQUARE_CELL,
  SQUARE_SIZE,
  HEX_VIEW,
  HEX_CX,
  HEX_CY,
  HEX_R_TRACK,
  HEX_R_GOAL,
} = rules;

export const SQUARE_TRACK           = rules.SQUARE_TRACK as Point[];
export const SQUARE_HOME_COLS       = rules.SQUARE_HOME_COLS as Point[][];
export const SQUARE_HOME_QUADRANTS  = rules.SQUARE_HOME_QUADRANTS as Point[];

export const isSquareBoard   = rules.isSquareBoard as (pc: number) => boolean;
export const getHexArms      = rules.getHexArms as (pc: number) => number;
export const getTrackLen     = rules.getTrackLen as (pc: number) => number;
export const getLoopLen      = rules.getLoopLen as (pc: number) => number;
export const getGoalPos      = rules.getGoalPos as (pc: number) => number;
export const getStartSq      = rules.getStartSq as (slot: number, pc: number) => number;
export const getHomeEntrance = rules.getHomeEntrance as (slot: number, pc: number) => number;
export const squareArm       = rules.squareArm as (slot: number, pc: number) => number;
export const isOnTrack       = rules.isOnTrack as (pathPos: number, pc: number) => boolean;
export const pathToTrack     = rules.pathToTrack as (pathPos: number, slot: number, pc: number) => number;
/** The pathPositions a piece marker should visibly step through, from...to (see rules.js). */
export const getWalkSteps    = rules.getWalkSteps as (fromPath: number, toPath: number) => number[];
/** Would landing on this absolute track square capture an opponent? Preview-only, mirrors the server's real rule. */
export const wouldCaptureAt  = rules.wouldCaptureAt as (
  trackIndex: number, playerIndex: number, players: Player[], pc: number,
) => boolean;
export const hexCorner       = rules.hexCorner as (k: number, arms: number) => Point;
/** A hex board's track cells, walked clockwise; length varies with player count (5-arm vs 6-arm). */
export const getHexTrack     = rules.getHexTrack as (pc: number) => Point[];
export const getHexHomeCols  = rules.getHexHomeCols as (pc: number) => Point[][];
export const getHexHomeBases = rules.getHexHomeBases as (pc: number) => Point[];

const safeSetFor = rules.getSafeSet as (pc: number) => Set<number>;
export const isSafeSquare = (trackIndex: number, pc: number) => safeSetFor(pc).has(trackIndex);

/**
 * Which of this player's pieces may legally move with this roll.
 *
 * Deliberately the *same* function the server uses to validate the move, so
 * the highlight a player sees can never disagree with what the server will
 * accept. Both board components used to reimplement this rule locally.
 */
export const getValidMoves = rules.getValidMoves as (
  player: { pieces: Piece[] },
  diceValue: number | null,
  state: { playerCount: number },
) => string[];

/** Every start square, so the board can tint them in their owner's colour. */
export function startSquares(playerCount: number): number[] {
  const slots = rules.isSquareBoard(playerCount) ? 4 : rules.getHexArms(playerCount);
  return Array.from({ length: slots }, (_, i) => rules.getStartSq(i, playerCount));
}
