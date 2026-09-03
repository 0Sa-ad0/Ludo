/**
 * Pure Ludo game-state logic — no I/O, no sockets, no DB.
 * Shared by server.js (runtime) and the test suite (tests/game-logic.test.js).
 */

const { v4: uuidv4 } = require('uuid');

const SQUARE_TRACK_LEN = 52;
const HEX_TRACK_LEN    = 60;
const HOME_COL_LEN     = 5;

const SQUARE_START = { 0: 0, 1: 13, 2: 26, 3: 39 };
const HEX_START    = { 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
const SQUARE_SAFE  = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const HEX_SAFE     = new Set([0, 8, 10, 18, 20, 28, 30, 38, 40, 48, 50, 58]);

function getTrackLen(pc) { return pc <= 4 ? SQUARE_TRACK_LEN : HEX_TRACK_LEN; }
function getSafeSet(pc)  { return pc <= 4 ? SQUARE_SAFE : HEX_SAFE; }
function getStartSq(idx, pc) { return pc <= 4 ? SQUARE_START[idx] : HEX_START[idx]; }

function pathToTrack(pathPos, playerIndex, pc) {
  const trackLen = getTrackLen(pc);
  return (getStartSq(playerIndex, pc) + pathPos) % trackLen;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createInitialState(roomCode, playerCount, passwordHash) {
  return {
    id:                   uuidv4(),
    roomCode,
    playerCount,
    passwordHash:         passwordHash || null,
    status:               'waiting',
    currentPlayerIndex:   0,
    players:              [],
    diceValue:            null,
    diceRolled:           false,
    lastMove:             null,
    winner:               null,
    rankings:             [],
  };
}

// Strip the password hash before broadcasting state to clients — no reason
// any client (not even the room's own players) needs to see it.
function sanitizeState(state) {
  const { passwordHash, ...rest } = state;
  return rest;
}

function createPlayer(gameId, name, colorIndex, slotIndex) {
  const pieces = Array.from({ length: 4 }, (_, i) => ({
    id:            `p${slotIndex}_piece${i}`,
    playerIndex:   slotIndex,
    pieceIndex:    i,
    status:        'home',
    trackPosition: -1,
    pathPosition:  -1,
  }));
  return {
    id:          uuidv4(),
    gameId,
    name,
    colorIndex,
    slotIndex,
    socketId:    null,
    isConnected: false,
    isAuto:      false,
    isFinished:  false,
    finishRank:  null,
    pieces,
  };
}

function getValidMoves(player, diceValue, state) {
  const pc = state.playerCount;
  const trackLen = getTrackLen(pc);
  const totalPath = trackLen + HOME_COL_LEN;

  return player.pieces
    .filter((piece) => {
      if (piece.status === 'finished') return false;
      if (piece.status === 'home')     return diceValue === 6;
      return piece.pathPosition + diceValue <= totalPath;
    })
    .map((p) => p.id);
}

function applyMove(state, playerIndex, pieceId, diceValue) {
  const s = JSON.parse(JSON.stringify(state));
  const player = s.players[playerIndex];
  const piece  = player.pieces.find((p) => p.id === pieceId);
  if (!piece) return s;

  const pc = s.playerCount;
  const trackLen  = getTrackLen(pc);
  const totalPath = trackLen + HOME_COL_LEN;
  const safeSet   = getSafeSet(pc);

  if (piece.status === 'home') {
    piece.status       = 'active';
    piece.pathPosition = 0;
    piece.trackPosition = getStartSq(playerIndex, pc);
  } else {
    piece.pathPosition += diceValue;
    piece.trackPosition = piece.pathPosition < trackLen
      ? pathToTrack(piece.pathPosition, playerIndex, pc)
      : -1;
  }

  if (piece.pathPosition === totalPath) {
    piece.status = 'finished';
    const allDone = player.pieces.every((p) => p.status === 'finished');
    if (allDone && !player.isFinished) {
      player.isFinished = true;
      player.finishRank = s.rankings.length + 1;
      s.rankings.push(playerIndex);
    }
  }

  // Capture check
  const capturedPieces = []; // [{ id, playerName }]
  if (piece.status === 'active' && piece.trackPosition !== -1) {
    const tp = piece.trackPosition;
    const startSq = getStartSq(playerIndex, pc);
    const isSafe = safeSet.has(tp) || tp === startSq;
    if (!isSafe) {
      for (const opp of s.players) {
        if (opp.slotIndex === playerIndex) continue;
        for (const op of opp.pieces) {
          if (op.status !== 'active' || op.trackPosition !== tp) continue;
          const sameCount = opp.pieces.filter(p => p.status === 'active' && p.trackPosition === tp).length;
          if (sameCount >= 2) continue; // block
          capturedPieces.push({ id: op.id, playerName: opp.name });
          op.status = 'home'; op.pathPosition = -1; op.trackPosition = -1;
        }
      }
    }
  }

  // Advance turn (a bonus roll on 6 is void if that move just finished the player —
  // there's no one left to take the bonus turn for)
  if (diceValue !== 6 || player.isFinished) {
    let next = (playerIndex + 1) % pc;
    let guard = 0;
    while (s.players[next].isFinished && guard < pc) {
      next = (next + 1) % pc; guard++;
    }
    s.currentPlayerIndex = next;
  }
  s.diceRolled = false;
  s.diceValue  = null;
  s.lastMove   = { playerIndex, pieceId, isAuto: false, capturedPieces };

  const active = s.players.filter(p => !p.isFinished);
  if (active.length <= 1) {
    if (active.length === 1) {
      const last = active[0];
      last.isFinished = true; last.finishRank = s.rankings.length + 1;
      s.rankings.push(last.slotIndex);
    }
    s.status = 'finished';
  }

  return s;
}

function pickAutoMove(player, diceValue, state) {
  const valid = getValidMoves(player, diceValue, state);
  if (!valid.length) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

module.exports = {
  SQUARE_TRACK_LEN, HEX_TRACK_LEN, HOME_COL_LEN,
  SQUARE_START, HEX_START, SQUARE_SAFE, HEX_SAFE,
  getTrackLen, getSafeSet, getStartSq, pathToTrack,
  generateRoomCode, createInitialState, sanitizeState, createPlayer,
  getValidMoves, applyMove, pickAutoMove,
};
