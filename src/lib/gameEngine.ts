import {
  SQUARE_BOARD_SAFE_SQUARES,
  SQUARE_BOARD_START_SQUARES,
  HEX_BOARD_SAFE_SQUARES,
  HEX_BOARD_START_SQUARES,
  HEX_BOARD_MAIN_TRACK_LENGTH,
  MAIN_TRACK_LENGTH,
  HOME_COLUMN_LENGTH,
} from './constants';
import type { Piece, Player, GameState } from './types';

// ─── Path Length per board type ───────────────────────────────────────────────
// Full path = main track + home column + 1 (goal)
function getMainTrackLength(playerCount: number): number {
  return playerCount <= 4 ? MAIN_TRACK_LENGTH : HEX_BOARD_MAIN_TRACK_LENGTH;
}

function getSafeSquares(playerCount: number): Set<number> {
  return playerCount <= 4 ? SQUARE_BOARD_SAFE_SQUARES : HEX_BOARD_SAFE_SQUARES;
}

function getStartSquare(playerIndex: number, playerCount: number): number {
  return playerCount <= 4
    ? SQUARE_BOARD_START_SQUARES[playerIndex]
    : HEX_BOARD_START_SQUARES[playerIndex];
}

// ─── Convert pathPosition → trackPosition ────────────────────────────────────
// pathPosition 0 = player's start square on the main track
// Returns the global track index (0–51 for square, 0–59 for hex)
function pathToTrack(pathPos: number, playerIndex: number, playerCount: number): number {
  const trackLen = getMainTrackLength(playerCount);
  const startSquare = getStartSquare(playerIndex, playerCount);
  return (startSquare + pathPos) % trackLen;
}

// ─── Is the piece in the home column? ────────────────────────────────────────
function inHomeColumn(piece: Piece, playerCount: number): boolean {
  const trackLen = getMainTrackLength(playerCount);
  return piece.pathPosition >= trackLen;
}

// ─── Is the piece at the goal? ───────────────────────────────────────────────
function atGoal(piece: Piece, playerCount: number): boolean {
  const trackLen = getMainTrackLength(playerCount);
  return piece.pathPosition === trackLen + HOME_COLUMN_LENGTH;
}

// ─── Get all valid pieces a player can move with a dice roll ──────────────────
export function getValidMoves(
  player: Player,
  diceValue: number,
  allPlayers: Player[],
  playerCount: number
): string[] {
  const trackLen = getMainTrackLength(playerCount);
  const totalPath = trackLen + HOME_COLUMN_LENGTH;

  return player.pieces
    .filter((piece) => {
      if (piece.status === 'finished') return false;

      // Piece is at home: need a 6 to release
      if (piece.status === 'home') {
        return diceValue === 6;
      }

      // Piece is active: check if move overshoots the goal
      const newPath = piece.pathPosition + diceValue;
      return newPath <= totalPath;
    })
    .map((p) => p.id);
}

// ─── Apply a move (pure function — returns new GameState) ─────────────────────
export function applyMove(
  state: GameState,
  playerIndex: number,
  pieceId: string,
  diceValue: number
): GameState {
  const newState: GameState = JSON.parse(JSON.stringify(state)); // deep clone
  const player = newState.players[playerIndex];
  const piece = player.pieces.find((p) => p.id === pieceId);
  if (!piece) return newState;

  const playerCount = newState.playerCount;
  const trackLen = getMainTrackLength(playerCount);
  const totalPath = trackLen + HOME_COLUMN_LENGTH;
  const safeSquares = getSafeSquares(playerCount);

  const prevPath = piece.pathPosition;

  // Releasing from home
  if (piece.status === 'home') {
    piece.status = 'active';
    piece.pathPosition = 0;
    piece.trackPosition = getStartSquare(playerIndex, playerCount);
  } else {
    piece.pathPosition += diceValue;
    if (!inHomeColumn(piece, playerCount)) {
      piece.trackPosition = pathToTrack(piece.pathPosition, playerIndex, playerCount);
    } else {
      piece.trackPosition = -1; // in home column
    }
  }

  // Reached goal
  if (piece.pathPosition === totalPath) {
    piece.status = 'finished';
    // Check if all pieces finished
    const allDone = player.pieces.every((p) => p.status === 'finished');
    if (allDone && !player.isFinished) {
      player.isFinished = true;
      const rank = newState.rankings.length + 1;
      player.finishRank = rank;
      newState.rankings.push(playerIndex);
    }
  }

  // Capture check (only on main track, not in home column)
  if (piece.status === 'active' && piece.trackPosition !== -1) {
    const trackPos = piece.trackPosition;
    const isSafe = safeSquares.has(trackPos) || trackPos === getStartSquare(playerIndex, playerCount);

    if (!isSafe) {
      for (const opponent of newState.players) {
        if (opponent.slotIndex === playerIndex) continue;
        for (const oppPiece of opponent.pieces) {
          if (oppPiece.status !== 'active') continue;
          if (oppPiece.trackPosition !== trackPos) continue;

          // Count how many same-color pieces are on that square (block check)
          const samePieces = opponent.pieces.filter(
            (p) => p.status === 'active' && p.trackPosition === trackPos
          ).length;
          if (samePieces >= 2) continue; // Block rule: 2+ same-color = protected

          // Send opponent piece home
          oppPiece.status = 'home';
          oppPiece.pathPosition = -1;
          oppPiece.trackPosition = -1;
        }
      }
    }
  }

  // Advance turn (only if dice ≠ 6, otherwise same player goes again)
  if (diceValue !== 6) {
    let next = (playerIndex + 1) % playerCount;
    // Skip finished players
    let loopGuard = 0;
    while (newState.players[next].isFinished && loopGuard < playerCount) {
      next = (next + 1) % playerCount;
      loopGuard++;
    }
    newState.currentPlayerIndex = next;
  }
  newState.diceRolled = false;
  newState.diceValue = null;

  // Check game over (all but one finished)
  const activePlayers = newState.players.filter((p) => !p.isFinished);
  if (activePlayers.length <= 1) {
    if (activePlayers.length === 1) {
      const last = newState.players.find((p) => !p.isFinished)!;
      last.isFinished = true;
      last.finishRank = newState.rankings.length + 1;
      newState.rankings.push(last.slotIndex);
    }
    newState.status = 'finished';
  }

  void prevPath; // suppress unused warning
  return newState;
}

// ─── Pick a random valid AUTO move ───────────────────────────────────────────
export function pickAutoMove(
  player: Player,
  diceValue: number,
  allPlayers: Player[],
  playerCount: number
): string | null {
  const valid = getValidMoves(player, diceValue, allPlayers, playerCount);
  if (valid.length === 0) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

// ─── Roll dice ────────────────────────────────────────────────────────────────
export function rollDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}
