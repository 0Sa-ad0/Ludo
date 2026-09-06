/**
 * Custom HTTP + Socket.io server. The socket layer is authoritative: clients
 * only ever *request* a roll or a move, and every rule check happens here.
 *
 * Run with: node server.js  (replaces `next dev` / `next start`)
 */

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const { Server }       = require('socket.io');
const bcrypt           = require('bcryptjs');
const {
  generateRoomCode, createInitialState, sanitizeState, createPlayer,
  getValidMoves, applyMove, pickAutoMove, rollDie,
  advanceTurn, clearDice, skipTurn, finalizeIfOver,
  isValidPlayerCount, MIN_PLAYERS, MAX_PLAYERS,
} = require('./game-logic');

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '4000', 10);

const app    = next({ dev });
const handle = app.getRequestHandler();

// ─── Tunables (overridable via env for fast, deterministic tests) ────────────
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 30_000;
const AUTO_MOVE_DELAY_MS = Number(process.env.AUTO_MOVE_DELAY_MS) || 1_200;
const TURN_TIMEOUT_MS    = Number(process.env.TURN_TIMEOUT_MS)    || 45_000;
const SKIP_NOTICE_MS     = Number(process.env.SKIP_NOTICE_MS)     || 1_400;
const ROOM_TTL_MS        = Number(process.env.ROOM_TTL_MS)        || 2 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS  = 5 * 60 * 1000;

const MAX_NAME_LEN = 20;

// ─── Server state ────────────────────────────────────────────────────────────
const gameRooms       = new Map(); // roomCode -> GameState
const disconnectTimers = new Map(); // `${roomCode}_${slotIndex}` -> timeout
const turnTimers       = new Map(); // roomCode -> timeout (AUTO / idle watchdog)
// Monotonic per-room counter. Every roll and every completed move bumps it, so
// an automatic turn already in flight can tell that a human (or another timer)
// got there first and bail out instead of clobbering the newer state.
const turnTokens       = new Map(); // roomCode -> number

// ─── Persistence (entirely optional) ─────────────────────────────────────────
// MySQL is a nice-to-have: it backs the leaderboard. The game itself runs from
// memory, so a missing database must degrade quietly rather than printing a
// line per state save — which would bury the "Network: http://…" address the
// host actually needs to read.
let pool = null;
let dbEnabled = false;
let dbFailures = 0;
const DB_FAILURE_LIMIT = 5;

/** Connection errors often arrive with an empty `.message` (aggregate DNS/TCP
 *  failures in particular), so prefer the code and always fall back. */
function describeDbError(e) {
  return e?.code || e?.message || String(e) || 'unknown error';
}

function noteDbFailure(label, e) {
  if (!dbEnabled) return;
  dbFailures += 1;
  console.warn(`[DB] ${label} failed: ${describeDbError(e)}`);
  if (dbFailures >= DB_FAILURE_LIMIT) {
    dbEnabled = false;
    console.warn('[DB] Too many consecutive failures — persistence disabled for this session. The game continues normally.');
  }
}

async function initDb() {
  try {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host:               process.env.DB_HOST     || 'localhost',
      port:               Number(process.env.DB_PORT) || 3306,
      user:               process.env.DB_USER     || 'root',
      password:           process.env.DB_PASSWORD || '',
      database:           process.env.DB_NAME     || 'ludo_game',
      waitForConnections: true,
      connectionLimit:    10,
      // Boot waits on this probe, so an unreachable host must fail fast
      // rather than sitting on the OS-default TCP timeout.
      connectTimeout:     Number(process.env.DB_CONNECT_TIMEOUT_MS) || 3000,
    });
    // Probe once up front so the outcome is known before any game starts,
    // instead of discovering it on every single query.
    await pool.query('SELECT 1');
    dbEnabled = true;
    console.log('[DB] Connected — games and leaderboard will persist.');
  } catch (e) {
    if (pool) { try { await pool.end(); } catch { /* ignore */ } }
    pool = null;
    dbEnabled = false;
    console.warn(`[DB] Not available (${describeDbError(e)}). Running in memory only — the game works, but there's no leaderboard.`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bumpTurn(roomCode) {
  const next = (turnTokens.get(roomCode) || 0) + 1;
  turnTokens.set(roomCode, next);
  return next;
}

function touch(state) { state.lastActivity = Date.now(); }

/** Names are user input and end up in the UI and the leaderboard — bound them. */
function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LEN);
}

function broadcastState(io, roomCode, state) {
  io.to(roomCode).emit('game_state', sanitizeState(state));
}

async function saveGameState(state) {
  if (!dbEnabled) return;
  try {
    await pool.execute(
      'UPDATE games SET board_state = ?, status = ?, current_player_index = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(state), state.status, state.currentPlayerIndex, state.id]
    );
    dbFailures = 0;
  } catch (e) { noteDbFailure('saveGameState', e); }
}

async function savePlayerRow(player) {
  if (!dbEnabled) return;
  try {
    await pool.execute(
      'UPDATE players SET socket_id = ?, is_connected = ?, is_auto = ?, is_finished = ?, finish_rank = ? WHERE id = ?',
      [player.socketId, player.isConnected, player.isAuto, player.isFinished, player.finishRank, player.id]
    );
    dbFailures = 0;
  } catch (e) { noteDbFailure('savePlayerRow', e); }
}

/**
 * Record the finished game once. Called from both the human and the AUTO
 * completion paths — previously only the human path updated the leaderboard,
 * so games that ended on an AUTO move silently vanished from the standings.
 */
async function recordResults(state) {
  if (state.leaderboardRecorded) return;
  state.leaderboardRecorded = true;
  if (!dbEnabled) return;
  for (const p of state.players) {
    const wins = p.finishRank === 1 ? 1 : 0;
    try {
      await pool.execute(
        'INSERT INTO leaderboard (player_name, wins, games_played) VALUES (?,?,1) ' +
        'ON DUPLICATE KEY UPDATE wins = wins + ?, games_played = games_played + 1',
        [p.name, wins, wins]
      );
    } catch (e) { noteDbFailure('leaderboard update', e); }
    await savePlayerRow(p);
  }
}

function clearTurnTimer(roomCode) {
  const t = turnTimers.get(roomCode);
  if (t) { clearTimeout(t); turnTimers.delete(roomCode); }
}

const lobbyTimerKey = (roomCode, playerId) => `${roomCode}_lobby_${playerId}`;

function clearTimerKey(key) {
  const t = disconnectTimers.get(key);
  if (t) { clearTimeout(t); disconnectTimers.delete(key); }
}

/** Drop every pending timer for one seat — both the in-game AUTO countdown
 *  (keyed by slot) and the lobby seat-release (keyed by player id). */
function clearDisconnectTimer(roomCode, slotIndex, playerId) {
  clearTimerKey(`${roomCode}_${slotIndex}`);
  if (playerId) clearTimerKey(lobbyTimerKey(roomCode, playerId));
}

async function endGame(io, roomCode, state) {
  clearTurnTimer(roomCode);
  io.to(roomCode).emit('game_over', state.rankings);
  await saveGameState(state);
  await recordResults(state);
}

// ─── Turn watchdog ───────────────────────────────────────────────────────────

/**
 * Arm the single timer that keeps a room moving. Exactly one of three things
 * is true of the player whose turn it is:
 *
 *   • offline and flipped to AUTO  → play their turn for them, shortly
 *   • connected                    → give them TURN_TIMEOUT_MS, then play it
 *                                    for them so one idle player cannot freeze
 *                                    the room for everybody else
 *   • offline, still inside the reconnect grace period → wait; the grace
 *                                    timer will re-arm us when it flips them
 */
function armTurn(io, roomCode) {
  clearTurnTimer(roomCode);
  const state = gameRooms.get(roomCode);
  if (!state || state.status !== 'playing') return;

  // Safety net: a finished player can never roll, so never leave the turn
  // sitting on one. Bounded rather than recursive — if somehow everyone were
  // finished while the game still said "playing", recursing here would run
  // the stack out instead of just giving up.
  let player = state.players[state.currentPlayerIndex];
  let corrected = false;
  for (let hops = 0; player && player.isFinished && hops < state.playerCount; hops++) {
    advanceTurn(state, state.currentPlayerIndex);
    clearDice(state);
    player = state.players[state.currentPlayerIndex];
    corrected = true;
  }
  if (!player) return;
  if (player.isFinished) {
    // Nobody left who can move — the game is over even if it didn't say so.
    finalizeIfOver(state);
    broadcastState(io, roomCode, state);
    return;
  }
  // Only when the net actually fired: every normal call already follows a
  // broadcast, and re-sending here would just double every update.
  if (corrected) broadcastState(io, roomCode, state);

  let delay;
  if (!player.isConnected && player.isAuto) delay = AUTO_MOVE_DELAY_MS;
  else if (player.isConnected)             delay = TURN_TIMEOUT_MS;
  else                                     return; // inside the grace period

  const abortIfConnected = !player.isConnected;
  turnTimers.set(roomCode, setTimeout(() => {
    playAutomaticTurn(io, roomCode, { abortIfConnected })
      .catch((e) => console.warn('[AUTO] turn failed:', e.message));
  }, delay));
}

/**
 * Take one full turn on a player's behalf: roll if they have not, pause so the
 * roll is actually visible to everyone, then move or skip.
 */
async function playAutomaticTurn(io, roomCode, { abortIfConnected = false } = {}) {
  let state = gameRooms.get(roomCode);
  if (!state || state.status !== 'playing') return;

  const pi = state.currentPlayerIndex;
  const stillTheirs = () => {
    const s = gameRooms.get(roomCode);
    return s && s.status === 'playing' && s.currentPlayerIndex === pi;
  };

  if (!state.diceRolled) {
    const value = rollDie();
    state.diceValue  = value;
    state.diceRolled = true;
    touch(state);
    const token = bumpTurn(roomCode);

    io.to(roomCode).emit('dice_rolled', { playerIndex: pi, value, isAuto: true });
    broadcastState(io, roomCode, state);

    await sleep(AUTO_MOVE_DELAY_MS);
    // A human (or another timer) acted while we were waiting — their state wins.
    if (turnTokens.get(roomCode) !== token) return;
  }

  state = gameRooms.get(roomCode);
  if (!state || !stillTheirs() || !state.diceRolled) return;

  const player = state.players[pi];
  // They came back inside the pause — hand the turn straight back to them.
  if (abortIfConnected && player.isConnected) return armTurn(io, roomCode);

  const value   = state.diceValue;
  const pieceId = pickAutoMove(player, value, state);

  if (pieceId) {
    const newState = applyMove(state, pi, pieceId, value);
    newState.lastMove.isAuto = true;
    newState.leaderboardRecorded = state.leaderboardRecorded;
    touch(newState);
    gameRooms.set(roomCode, newState);
    bumpTurn(roomCode);
    await saveGameState(newState);

    io.to(roomCode).emit('piece_moved', {
      playerIndex: pi, pieceId, isAuto: true,
      capturedPieces: newState.lastMove.capturedPieces,
    });
    broadcastState(io, roomCode, newState);

    if (newState.status === 'finished') return endGame(io, roomCode, newState);
    return armTurn(io, roomCode);
  }

  // Nothing legal to do with this roll.
  io.to(roomCode).emit('turn_skipped', { playerIndex: pi, value, isAuto: true });
  skipTurn(state, pi, value);
  touch(state);
  bumpTurn(roomCode);
  await saveGameState(state);
  broadcastState(io, roomCode, state);
  armTurn(io, roomCode);
}

// ─── Room bookkeeping ────────────────────────────────────────────────────────

/**
 * Rebuild slot/colour indices after someone leaves a room that has not started
 * yet, so the remaining players stay contiguous from 0. Piece ids embed the
 * slot, so the pieces are regenerated too — safe here precisely because
 * nothing has moved yet.
 */
function reindexPlayers(state) {
  state.players.forEach((p, i) => {
    p.slotIndex  = i;
    p.colorIndex = i;
    p.isHost     = i === 0;
    p.pieces = p.pieces.map((piece, pieceIndex) => ({
      ...piece,
      id: `p${i}_piece${pieceIndex}`,
      playerIndex: i,
    }));
  });
}

function disposeRoom(roomCode) {
  clearTurnTimer(roomCode);
  for (const key of [...disconnectTimers.keys()]) {
    if (key.startsWith(`${roomCode}_`)) {
      clearTimeout(disconnectTimers.get(key));
      disconnectTimers.delete(key);
    }
  }
  turnTokens.delete(roomCode);
  gameRooms.delete(roomCode);
}

/** Rooms live only in memory, so without this the map grows for ever. */
function sweepRooms() {
  const now = Date.now();
  for (const [roomCode, state] of gameRooms) {
    const idleFor = now - (state.lastActivity || state.createdAt || now);
    const nobodyHere = state.players.every((p) => !p.isConnected);
    if (idleFor > ROOM_TTL_MS || (nobodyHere && idleFor > ROOM_TTL_MS / 4)) {
      console.log(`[ROOM] sweeping idle room ${roomCode}`);
      disposeRoom(roomCode);
    }
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
Promise.all([app.prepare(), initDb()]).then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/api/socket',
  });

  setInterval(sweepRooms, SWEEP_INTERVAL_MS).unref?.();

  io.on('connection', (socket) => {
    console.log('[WS] Connected:', socket.id);

    const fail = (msg) => socket.emit('error', msg);

    /** Resolve the room + player this socket actually owns. */
    function context() {
      const { roomCode, playerIndex } = socket.data || {};
      if (roomCode == null) return null;
      const state = gameRooms.get(roomCode);
      if (!state) return null;
      const player = state.players[playerIndex];
      if (!player) return null;
      return { roomCode, playerIndex, state, player };
    }

    // ── Latency probe ───────────────────────────────────────────────────────
    socket.on('ping', (clientTime) => socket.emit('ping_ack', clientTime));

    // ── Create room ─────────────────────────────────────────────────────────
    socket.on('create_room', async ({ playerCount, playerName, password } = {}) => {
      const name = cleanName(playerName);
      const count = Number(playerCount);
      if (!name) return fail('Enter your name');
      if (!isValidPlayerCount(count)) {
        return fail(`Player count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
      }
      if (password != null && typeof password !== 'string') return fail('Invalid password');

      let roomCode = generateRoomCode();
      while (gameRooms.has(roomCode)) roomCode = generateRoomCode();

      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      const state = createInitialState(roomCode, count, passwordHash);
      touch(state);

      const player = createPlayer(state.id, name, 0, 0);
      player.socketId = socket.id;
      player.isConnected = true;
      state.players.push(player);
      gameRooms.set(roomCode, state);

      if (dbEnabled) {
        try {
          await pool.execute(
            'INSERT INTO games (id, room_code, password_hash, player_count, status, current_player_index, board_state) VALUES (?,?,?,?,?,?,?)',
            [state.id, roomCode, state.passwordHash, count, 'waiting', 0, JSON.stringify(state)]
          );
          await pool.execute(
            'INSERT INTO players (id, game_id, name, color_index, slot_index, socket_id, is_connected) VALUES (?,?,?,?,?,?,?)',
            [player.id, state.id, player.name, 0, 0, socket.id, true]
          );
          dbFailures = 0;
        } catch (e) { noteDbFailure('create_room persist', e); }
      }

      socket.join(roomCode);
      socket.data.roomCode    = roomCode;
      socket.data.playerIndex = 0;

      socket.emit('room_created', { roomCode, playerIndex: 0 });
      broadcastState(io, roomCode, state);
    });

    // ── Join / reconnect ────────────────────────────────────────────────────
    socket.on('join_room', async ({ roomCode, playerName, password } = {}) => {
      const name = cleanName(playerName);
      if (!name) return fail('Enter your name');
      if (typeof roomCode !== 'string') return fail('Room not found');

      const code  = roomCode.toUpperCase().trim();
      const state = gameRooms.get(code);
      if (!state) return fail('Room not found');
      if (state.status === 'finished') return fail('Game already finished');

      if (state.passwordHash && !(await bcrypt.compare(String(password || ''), state.passwordHash))) {
        return fail('Wrong password');
      }

      // ── Reconnecting to an existing seat ──
      const existing = state.players.find((p) => p.name === name && !p.isConnected);
      if (existing) {
        existing.socketId    = socket.id;
        existing.isConnected = true;
        existing.isAuto      = false;
        touch(state);

        // Cancels both the AUTO countdown and any pending lobby seat-release.
        clearDisconnectTimer(code, existing.slotIndex, existing.id);

        socket.join(code);
        socket.data.roomCode    = code;
        socket.data.playerIndex = existing.slotIndex;

        await savePlayerRow(existing);
        socket.emit('joined', { playerIndex: existing.slotIndex });
        io.to(code).emit('player_reconnected', existing.slotIndex);
        // Broadcast to the whole room, not just the reconnecting socket —
        // otherwise every other player's UI stays stuck on the old
        // "reconnecting" state until some unrelated action happens to trigger
        // the next game_state broadcast.
        broadcastState(io, code, state);
        // They may have come back on their own turn; re-arm so the idle
        // watchdog applies to them again instead of the AUTO one.
        armTurn(io, code);
        return;
      }

      // ── Brand new player ──
      if (state.status !== 'waiting')                 return fail('Game already started');
      if (state.players.length >= state.playerCount)  return fail('Room is full');
      // Seats are reclaimed by name, so two live players sharing one would make
      // reconnection ambiguous — and the leaderboard is keyed by name too.
      if (state.players.some((p) => p.name === name)) return fail('That name is already taken in this room');

      const slotIndex = state.players.length;
      const player = createPlayer(state.id, name, slotIndex, slotIndex);
      player.socketId    = socket.id;
      player.isConnected = true;
      state.players.push(player);
      touch(state);

      if (dbEnabled) {
        try {
          await pool.execute(
            'INSERT INTO players (id, game_id, name, color_index, slot_index, socket_id, is_connected) VALUES (?,?,?,?,?,?,?)',
            [player.id, state.id, name, slotIndex, slotIndex, socket.id, true]
          );
          dbFailures = 0;
        } catch (e) { noteDbFailure('join_room persist', e); }
      }

      socket.join(code);
      socket.data.roomCode    = code;
      socket.data.playerIndex = slotIndex;

      socket.emit('joined', { playerIndex: slotIndex });
      broadcastState(io, code, state);

      if (state.players.length === state.playerCount) await startGame(code, state);
    });

    // ── Host: start before the room is full ─────────────────────────────────
    socket.on('start_game', async () => {
      const ctx = context();
      if (!ctx) return;
      const { roomCode, state, player } = ctx;
      if (!player.isHost)             return fail('Only the host can start the game');
      if (state.status !== 'waiting') return fail('Game already started');
      if (state.players.length < MIN_PLAYERS) return fail(`Need at least ${MIN_PLAYERS} players`);

      // Shrink the room to who actually turned up — this also picks the board,
      // so a 6-player room started with 3 correctly plays on the square board.
      state.playerCount = state.players.length;
      await startGame(roomCode, state);
    });

    // ── Host: remove someone from the lobby ─────────────────────────────────
    socket.on('kick_player', async ({ slotIndex } = {}) => {
      const ctx = context();
      if (!ctx) return;
      const { roomCode, state, player } = ctx;
      if (!player.isHost)             return fail('Only the host can remove players');
      if (state.status !== 'waiting') return fail('Cannot remove players once the game has started');
      if (slotIndex === player.slotIndex) return fail('You cannot remove yourself');

      const target = state.players[slotIndex];
      if (!target) return;

      const targetSocket = target.socketId && io.sockets.sockets.get(target.socketId);
      state.players.splice(slotIndex, 1);
      reindexPlayers(state);
      touch(state);

      if (targetSocket) {
        targetSocket.emit('kicked');
        targetSocket.leave(roomCode);
        targetSocket.data.roomCode = undefined;
      }
      // Slots shifted, so everyone needs their index re-issued.
      resyncIndices(io, roomCode, state);
      broadcastState(io, roomCode, state);
    });

    // ── Roll ────────────────────────────────────────────────────────────────
    socket.on('roll_dice', async () => {
      const ctx = context();
      if (!ctx) return;
      const { roomCode, playerIndex, state, player } = ctx;
      if (state.status !== 'playing')            return;
      if (state.currentPlayerIndex !== playerIndex) return;
      if (state.diceRolled)                      return;
      if (player.isFinished)                     return;

      const value = rollDie();
      state.diceValue  = value;
      state.diceRolled = true;
      touch(state);
      const token = bumpTurn(roomCode);

      io.to(roomCode).emit('dice_rolled', { playerIndex, value });
      broadcastState(io, roomCode, state);

      if (getValidMoves(player, value, state).length > 0) {
        // They have a decision to make — restart the idle clock for it.
        return armTurn(io, roomCode);
      }

      // Nothing legal. Hold the roll on screen briefly so the player can see
      // why their turn ended, then move on.
      io.to(roomCode).emit('turn_skipped', { playerIndex, value, isAuto: false });
      clearTurnTimer(roomCode);
      await sleep(SKIP_NOTICE_MS);
      if (turnTokens.get(roomCode) !== token) return;

      // Re-read rather than trusting the closure: the room may have been
      // replaced by a move applied elsewhere while we were waiting.
      const s = gameRooms.get(roomCode);
      if (!s || s.status !== 'playing') return;
      skipTurn(s, playerIndex, value);
      touch(s);
      bumpTurn(roomCode);
      await saveGameState(s);
      broadcastState(io, roomCode, s);
      armTurn(io, roomCode);
    });

    // ── Move ────────────────────────────────────────────────────────────────
    socket.on('move_piece', async ({ pieceId } = {}) => {
      const ctx = context();
      if (!ctx) return;
      const { roomCode, playerIndex, state, player } = ctx;
      if (state.status !== 'playing')               return;
      if (state.currentPlayerIndex !== playerIndex) return;
      if (!state.diceRolled)                        return;
      if (typeof pieceId !== 'string')              return fail('Invalid move');

      if (!getValidMoves(player, state.diceValue, state).includes(pieceId)) {
        return fail('Invalid move');
      }

      const newState = applyMove(state, playerIndex, pieceId, state.diceValue);
      newState.leaderboardRecorded = state.leaderboardRecorded;
      touch(newState);
      gameRooms.set(roomCode, newState);
      bumpTurn(roomCode);
      await saveGameState(newState);

      io.to(roomCode).emit('piece_moved', {
        playerIndex, pieceId,
        capturedPieces: newState.lastMove.capturedPieces,
      });
      broadcastState(io, roomCode, newState);

      if (newState.status === 'finished') return endGame(io, roomCode, newState);
      armTurn(io, roomCode);
    });

    // ── Leave ───────────────────────────────────────────────────────────────
    socket.on('leave_room', async () => {
      const ctx = context();
      if (!ctx) return;
      const { roomCode, state, player } = ctx;

      socket.leave(roomCode);
      socket.data.roomCode = undefined;

      if (state.status === 'waiting') {
        // Nothing has moved yet, so the seat can just be removed outright.
        state.players.splice(player.slotIndex, 1);
        if (state.players.length === 0) return disposeRoom(roomCode);
        reindexPlayers(state);
        touch(state);
        resyncIndices(io, roomCode, state);
        broadcastState(io, roomCode, state);
      } else {
        // Mid-game their seat has to stay, or the board would renumber under
        // everyone — hand it to AUTO instead.
        player.isConnected = false;
        player.isAuto      = true;
        player.socketId    = null;
        touch(state);
        await savePlayerRow(player);
        io.to(roomCode).emit('player_auto', player.slotIndex);
        broadcastState(io, roomCode, state);
        armTurn(io, roomCode);
      }
    });

    // ── Disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const { roomCode, playerIndex } = socket.data || {};
      if (roomCode == null) return;
      const state = gameRooms.get(roomCode);
      if (!state) return;
      const player = state.players[playerIndex];
      if (!player) return;

      // Only the socket that currently owns the seat may close it. Without
      // this check a stale socket's late disconnect knocks offline a player
      // who has already reconnected on a newer one.
      if (player.socketId !== socket.id) return;

      player.isConnected = false;
      player.socketId    = null;
      touch(state);
      await savePlayerRow(player);

      io.to(roomCode).emit('player_left', playerIndex);
      broadcastState(io, roomCode, state);

      // In the lobby the seat is held just long enough to survive a refresh,
      // then freed. Holding it for ever meant anyone who closed their tab left
      // a ghost the room could never fill past; freeing it immediately would
      // cost people their slot every time they reloaded the page.
      if (state.status === 'waiting') return scheduleLobbyRemoval(io, roomCode, player);

      // Nothing to schedule for a game that has already finished.
      if (state.status !== 'playing') return;

      clearDisconnectTimer(roomCode, playerIndex, player.id);
      disconnectTimers.set(`${roomCode}_${playerIndex}`, setTimeout(() => {
        disconnectTimers.delete(`${roomCode}_${playerIndex}`);
        const s = gameRooms.get(roomCode);
        if (!s) return;
        const p = s.players[playerIndex];
        if (!p || p.isConnected) return; // came back inside the grace period

        p.isAuto = true;
        savePlayerRow(p);
        io.to(roomCode).emit('player_auto', playerIndex);
        broadcastState(io, roomCode, s);
        armTurn(io, roomCode);
      }, RECONNECT_GRACE_MS));
    });
  });

  // ─── Room lifecycle helpers that need `io` ────────────────────────────────

  /**
   * Free a lobby seat if its owner hasn't come back within the grace period.
   *
   * Keyed by the player's id rather than their slot: removing a seat renumbers
   * everyone after it, so a slot-keyed timer would come due pointing at a
   * different person entirely.
   */
  function scheduleLobbyRemoval(io, roomCode, player) {
    const key = lobbyTimerKey(roomCode, player.id);
    if (disconnectTimers.has(key)) clearTimeout(disconnectTimers.get(key));

    disconnectTimers.set(key, setTimeout(() => {
      disconnectTimers.delete(key);
      const s = gameRooms.get(roomCode);
      if (!s || s.status !== 'waiting') return;

      const idx = s.players.findIndex((p) => p.id === player.id);
      if (idx === -1) return;
      if (s.players[idx].isConnected) return; // came back inside the grace period

      s.players.splice(idx, 1);
      if (s.players.length === 0) return disposeRoom(roomCode);

      reindexPlayers(s);
      touch(s);
      resyncIndices(io, roomCode, s);
      broadcastState(io, roomCode, s);
    }, RECONNECT_GRACE_MS));
  }

  /** After a lobby reshuffle, tell every socket what its slot is now. */
  function resyncIndices(io, roomCode, state) {
    for (const p of state.players) {
      const s = p.socketId && io.sockets.sockets.get(p.socketId);
      if (s) {
        s.data.playerIndex = p.slotIndex;
        s.emit('joined', { playerIndex: p.slotIndex });
      }
    }
  }

  async function startGame(roomCode, state) {
    state.status = 'playing';
    state.currentPlayerIndex = 0;
    touch(state);
    await saveGameState(state);
    // sanitizeState here too — this emit used to ship the bcrypt hash to
    // every client in the room.
    io.to(roomCode).emit('game_started', sanitizeState(state));
    broadcastState(io, roomCode, state);
    armTurn(io, roomCode);
  }

  // ─── Listen ───────────────────────────────────────────────────────────────
  httpServer.listen(port, '0.0.0.0', () => {
    console.log('\n🎮 Ludo Game running at:');
    console.log(`   Local:   http://localhost:${port}`);
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`   Network: http://${net.address}:${port}  ← Share this on WiFi`);
        }
      }
    }
    console.log('');
  });
});
