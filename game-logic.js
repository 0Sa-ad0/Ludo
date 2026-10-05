/**
 * Ludo game-state transitions — no I/O, no sockets, no DB.
 * Shared by server.js (runtime) and the test suite (tests/game-logic.test.js).
 *
 * The rules themselves (path lengths, safe squares, move legality, board
 * geometry) live in src/lib/rules.js, which the React components import too —
 * so a rule only ever has to be changed in one place.
 */

const { v4: uuidv4 } = require('uuid');
const rules = require('./src/lib/rules');

const {
  PIECES_PER_PLAYER, HOME_COLUMN_LEN, MIN_PLAYERS, MAX_PLAYERS,
  SQUARE_TRACK_LEN, SQUARE_START, SQUARE_SAFE,
  getTrackLen, getLoopLen, getGoalPos, getSafeSet, getStartSq,
  isOnTrack, pathToTrack, getHomeEntrance, isValidPlayerCount, getValidMoves,
  capturesAt,
} = rules;

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Fisher-Yates. Used to pick which of the 6 player colors lands on which
 *  seat, per room — so hosting never deterministically hands out the same
 *  color every time (it used to just be colorIndex = slotIndex, meaning the
 *  host always got color 0 and every room looked the same). */
function shuffled(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createInitialState(roomCode, playerCount, passwordHash, teamMode = false) {
  return {
    id:                   uuidv4(),
    roomCode,
    playerCount,
    // 2v2: partners sit opposite (slots 0+2 vs 1+3) once the game starts —
    // see arrangeTeamSeats. Each player carries `team` (0 or 1).
    teamMode:             !!teamMode,
    winningTeam:          null,
    passwordHash:         passwordHash || null,
    status:               'waiting',
    currentPlayerIndex:   0,
    players:              [],
    diceValue:            null,
    diceRolled:           false,
    sixStreak:            0,
    lastMove:             null,
    winner:               null,
    rankings:             [],
    // Slots forced out mid-game (kicked/forfeited), in the order it happened.
    // Held here rather than folded straight into `rankings` — see
    // finalizeIfOver for why: a forfeit isn't a finish, and shouldn't be able
    // to outrank someone who actually completes the race afterwards.
    kickedOrder:          [],
    createdAt:            Date.now(),
    // Which color a seat gets, randomized once per room — see shuffled().
    colorOrder:           shuffled(Array.from({ length: MAX_PLAYERS }, (_, i) => i)),
  };
}

// Strip the password hash before broadcasting state to clients — no reason
// any client (not even the room's own players) needs to see it.
function sanitizeState(state) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured purely to omit it
  const { passwordHash, ...rest } = state;
  return rest;
}

function createPlayer(gameId, name, colorIndex, slotIndex) {
  const pieces = Array.from({ length: PIECES_PER_PLAYER }, (_, i) => ({
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
    isHost:      slotIndex === 0,
    team:        null,
    pieces,
  };
}

// ─── Turn bookkeeping ────────────────────────────────────────────────────────

/**
 * Hand the turn to the next player who is still in the game, skipping anyone
 * who has already finished. Mutates `state`.
 *
 * Guarded against the case where nobody is left to play — the caller is
 * expected to have ended the game by then, but an infinite loop here would
 * hang the whole server, so it is not left to chance.
 */
function advanceTurn(state, fromIndex) {
  const pc = state.playerCount;
  let next = (fromIndex + 1) % pc;
  for (let guard = 0; guard < pc; guard++) {
    if (state.players[next] && !state.players[next].isFinished) break;
    next = (next + 1) % pc;
  }
  state.currentPlayerIndex = next;
  // Whoever's turn it is now starts with a clean six-streak, regardless of
  // what the previous player's streak was.
  state.sixStreak = 0;
  return state;
}

/**
 * Track consecutive 6s within one player's unbroken run of rolls (bonus
 * rolls chain the same turn together; any non-6 breaks the streak even if
 * it earns its own bonus via a capture or a finish). This is what rollDie
 * consults to keep a third 6 in a row from ever coming up — a deliberate
 * house rule for this game, not the traditional "three 6s forfeits the
 * turn" rule (which needs a real third 6 to actually happen). Mutates
 * state.sixStreak.
 */
function registerRoll(state, diceValue) {
  state.sixStreak = diceValue === 6 ? (state.sixStreak || 0) + 1 : 0;
}

/** Clear the roll so the next player starts from a clean slate. Mutates. */
function clearDice(state) {
  state.diceRolled = false;
  state.diceValue  = null;
  return state;
}

/**
 * End the current player's go without moving anything — used when a roll
 * produces no legal move at all, for any piece. Always passes the turn on,
 * even for a 6: a 6 only bonus-rerolls when it was actually usable — if
 * nothing could be released and nothing else avoids overshooting (e.g. the
 * only piece left is in the home stretch needing less than 6), it's treated
 * the same as any other dead roll.
 */
function skipTurn(state, playerIndex) {
  advanceTurn(state, playerIndex);
  return clearDice(state);
}

/**
 * Close the game out once at most one player is still going: the straggler is
 * awarded the final rank rather than being left to play alone. Mutates.
 *
 * Anyone forced out mid-game (kicked/forfeited) is only placed into
 * `rankings` here, at the very end — not at the moment they're kicked. A
 * forfeit isn't a finish: pushing them into `rankings` immediately would let
 * the first person kicked claim finishRank 1 (a "win", per recordResults)
 * ahead of players who go on to actually complete the race. They're ranked
 * below every real finisher and below whoever was still playing at the end,
 * ordered so that lasting longer before being kicked still counts for something
 * (most-recently-kicked ranks best among the forfeits).
 */
function finalizeIfOver(state) {
  if (state.teamMode) return finalizeTeamsIfOver(state);
  const active = state.players.filter((p) => !p.isFinished);
  if (active.length > 1) return state;

  if (active.length === 1) {
    const last = active[0];
    last.isFinished = true;
    last.finishRank = state.rankings.length + 1;
    state.rankings.push(last.slotIndex);
  }

  // kickedOrder is left in place afterwards — the end screen reads it to
  // mark who was removed rather than finishing.
  const kickedOrder = state.kickedOrder || [];
  for (let i = kickedOrder.length - 1; i >= 0; i--) {
    const player = state.players[kickedOrder[i]];
    player.finishRank = state.rankings.length + 1;
    state.rankings.push(player.slotIndex);
  }

  state.status = 'finished';
  state.winner = state.rankings.length ? state.rankings[0] : null;
  return state;
}

/**
 * 2v2: a team wins the moment every one of its members still in the game has
 * all four pieces home. A partner the host removed doesn't count — the other
 * keeps playing alone, and wins for the team by finishing their own pieces.
 * A team with nobody left in the game at all loses outright.
 *
 * Winners both get finishRank 1 (that's what recordResults counts as a win),
 * losers both get 2. Mutates.
 */
function finalizeTeamsIfOver(state) {
  const kicked = new Set(state.kickedOrder || []);
  const statusOf = (team) => {
    const inGame = state.players.filter((p) => p.team === team && !kicked.has(p.slotIndex));
    return {
      gone: inGame.length === 0,
      done: inGame.length > 0 && inGame.every((p) => p.pieces.every((pc) => pc.status === 'finished')),
    };
  };
  const [a, b] = [statusOf(0), statusOf(1)];

  let winningTeam = null;
  if (a.done) winningTeam = 0;
  else if (b.done) winningTeam = 1;
  else if (a.gone && !b.gone) winningTeam = 1;
  else if (b.gone && !a.gone) winningTeam = 0;
  if (winningTeam === null) return state;

  // Winners first, each team in the order its members actually finished.
  const finishedOrder = state.rankings.slice();
  const order = (team) => state.players
    .filter((p) => p.team === team)
    .sort((x, y) => {
      const ix = finishedOrder.indexOf(x.slotIndex), iy = finishedOrder.indexOf(y.slotIndex);
      return (ix < 0 ? Infinity : ix) - (iy < 0 ? Infinity : iy) || x.slotIndex - y.slotIndex;
    });
  const winners = order(winningTeam);
  const losers  = order(1 - winningTeam);
  for (const p of winners) { p.isFinished = true; p.finishRank = 1; }
  for (const p of losers)  { p.isFinished = true; p.finishRank = 2; }

  state.rankings    = [...winners, ...losers].map((p) => p.slotIndex);
  state.winningTeam = winningTeam;
  state.winner      = state.rankings[0];
  state.status      = 'finished';
  return state;
}

// ─── Teams (2v2) ─────────────────────────────────────────────────────────────

const TEAM_SIZE = 2;

/** New arrivals go to whichever team is shorter, so a full room is always 2 v 2. */
function pickTeamForNewPlayer(state) {
  const count = (team) => state.players.filter((p) => p.team === team).length;
  return count(0) <= count(1) ? 0 : 1;
}

/**
 * Seat partners opposite each other — on the square board slots 0+2 and 1+3
 * face each other across the centre, and turns run 0,1,2,3, so this also
 * makes the teams alternate turns. The host keeps slot 0. Only reorders
 * `state.players`; the caller re-derives slot indices (reindexPlayers).
 */
function arrangeTeamSeats(state) {
  const host   = state.players.find((p) => p.isHost) ?? state.players[0];
  const mine   = state.players.filter((p) => p.team === host.team)
    .sort((x, y) => Number(y === host) - Number(x === host));
  const theirs = state.players.filter((p) => p.team !== host.team);
  state.players = [mine[0], theirs[0], mine[1], theirs[1]];
  return state;
}

// ─── Moves ───────────────────────────────────────────────────────────────────

/**
 * Apply a move and return a NEW state — callers rely on this being pure, so
 * the incoming state is never mutated.
 *
 * The move is assumed to already be legal; server.js checks it against
 * getValidMoves before calling.
 */
function applyMove(state, playerIndex, pieceId, diceValue) {
  const s = JSON.parse(JSON.stringify(state));
  const player = s.players[playerIndex];
  if (!player) return s;
  const piece = player.pieces.find((p) => p.id === pieceId);
  if (!piece) return s;

  const pc      = s.playerCount;
  const goal    = getGoalPos(pc);

  // ── Advance the piece ──────────────────────────────────────────────────
  if (piece.status === 'home') {
    piece.status        = 'active';
    piece.pathPosition  = 0;
    piece.trackPosition = getStartSq(playerIndex, pc);
  } else {
    piece.pathPosition  = piece.pathPosition + diceValue;
    // Once past the loop the piece is in its private home column, where it is
    // off the shared track and can no longer be captured.
    piece.trackPosition = isOnTrack(piece.pathPosition, pc)
      ? pathToTrack(piece.pathPosition, playerIndex, pc)
      : -1;
  }

  if (piece.pathPosition === goal) {
    piece.status = 'finished';
    piece.trackPosition = -1;
    if (player.pieces.every((p) => p.status === 'finished') && !player.isFinished) {
      player.isFinished = true;
      player.finishRank = s.rankings.length + 1;
      s.rankings.push(playerIndex);
      // In a team game one partner finishing isn't a win — the team wins
      // together, decided in finalizeTeamsIfOver.
      if (s.winner === null && !s.teamMode) s.winner = playerIndex;
    }
  }

  // ── Capture ────────────────────────────────────────────────────────────
  // rules.capturesAt is the single capture rule (safe squares, blocks, and
  // never capturing a teammate) — the board's move preview calls it too.
  const capturedPieces = []; // [{ id, playerName }]
  if (piece.status === 'active' && piece.trackPosition !== -1) {
    for (const { piece: op, player: opp } of capturesAt(piece.trackPosition, playerIndex, s.players, pc)) {
      capturedPieces.push({ id: op.id, playerName: opp.name });
      op.status = 'home';
      op.pathPosition = -1;
      op.trackPosition = -1;
    }
  }

  // ── Hand over the turn ─────────────────────────────────────────────────
  // Three things earn a bonus roll: rolling a 6, capturing an opponent's
  // piece, and getting a piece all the way home — standard across Ludo King
  // and most physical rule sets. None of that matters if this move just
  // finished the player (all 4 pieces home): there is no longer anyone left
  // to take the bonus turn, so the turn must always pass on.
  const pieceFinishedThisMove = piece.status === 'finished';
  const earnedBonusRoll = diceValue === 6 || capturedPieces.length > 0 || pieceFinishedThisMove;
  if (!earnedBonusRoll || player.isFinished) advanceTurn(s, playerIndex);
  clearDice(s);

  s.lastMove = { playerIndex, pieceId, isAuto: false, capturedPieces };
  return finalizeIfOver(s);
}

/** AUTO mode: not AI, just a uniformly random pick from the legal moves. */
function pickAutoMove(player, diceValue, state) {
  const valid = getValidMoves(player, diceValue, state);
  if (!valid.length) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

/**
 * A six-sided die — EXCEPT after two 6s in a row this turn, where a third
 * would be excluded: house rule, so the die draws from 1-5 instead. Pass the
 * player's current sixStreak (before this roll) to apply it.
 * @param {number} sixStreak
 */
function rollDie(sixStreak = 0) {
  const faces = sixStreak >= 2 ? 5 : 6;
  return Math.floor(Math.random() * faces) + 1;
}

module.exports = {
  // re-exported rules, so server.js has a single import
  PIECES_PER_PLAYER, HOME_COLUMN_LEN, MIN_PLAYERS, MAX_PLAYERS,
  SQUARE_TRACK_LEN, SQUARE_START, SQUARE_SAFE,
  getTrackLen, getLoopLen, getGoalPos, getSafeSet, getStartSq,
  isOnTrack, pathToTrack, getHomeEntrance, isValidPlayerCount, getValidMoves,
  // state transitions
  generateRoomCode, createInitialState, sanitizeState, createPlayer,
  advanceTurn, clearDice, skipTurn, finalizeIfOver, registerRoll,
  applyMove, pickAutoMove, rollDie,
  // teams
  TEAM_SIZE, pickTeamForNewPlayer, arrangeTeamSeats,
};
