/**
 * Custom Express + Socket.io server.
 * Run with: node server.js
 * This replaces `next dev` / `next start`.
 */

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const { Server }       = require('socket.io');
const bcrypt           = require('bcryptjs');
const {
  generateRoomCode, createInitialState, sanitizeState, createPlayer,
  getValidMoves, applyMove, pickAutoMove,
} = require('./game-logic');

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '4000', 10);

const app    = next({ dev });
const handle = app.getRequestHandler();

// ─── In-memory game rooms (also persisted to MySQL) ──────────────────────────
// Imported here to avoid TypeScript compilation issues in plain .js
// Game logic is handled by gameEngine (compiled separately or via ts-node)

let pool;
try {
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    host:             process.env.DB_HOST     || 'localhost',
    port:             Number(process.env.DB_PORT) || 3306,
    user:             process.env.DB_USER     || 'root',
    password:         process.env.DB_PASSWORD || '',
    database:         process.env.DB_NAME     || 'ludo_game',
    waitForConnections: true,
    connectionLimit:  10,
  });
  console.log('[DB] MySQL pool created');
} catch (e) {
  console.warn('[DB] MySQL not available — running without persistence:', e.message);
}

// Active game states in memory  { roomCode -> GameState }
const gameRooms = new Map();
// Disconnect timers { `${roomCode}_${playerIndex}` -> setTimeout handle }
const disconnectTimers = new Map();
// Auto timers { `${roomCode}_${playerIndex}` -> setTimeout handle }
const autoTimers = new Map();

// Overridable via env for fast, deterministic tests — defaults match production.
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 30_000;
const AUTO_MOVE_DELAY_MS = Number(process.env.AUTO_MOVE_DELAY_MS) || 2_000;

async function saveGameState(state) {
  if (!pool) return;
  try {
    await pool.execute(
      'UPDATE games SET board_state = ?, status = ?, current_player_index = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(state), state.status, state.currentPlayerIndex, state.id]
    );
  } catch (e) { console.warn('[DB] saveGameState error:', e.message); }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/api/socket',
  });

  // ─── Socket.io Events ──────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log('[WS] Connected:', socket.id);

    // ── Ping ──────────────────────────────────────────────────────────────────
    socket.on('ping', (clientTime) => {
      socket.emit('ping_ack', clientTime);
    });

    // ── Create Room ───────────────────────────────────────────────────────────
    socket.on('create_room', async ({ playerCount, playerName, password }) => {
      let roomCode = generateRoomCode();
      while (gameRooms.has(roomCode)) roomCode = generateRoomCode();

      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      const state = createInitialState(roomCode, playerCount, passwordHash);
      const player = createPlayer(state.id, playerName, 0, 0);
      player.socketId = socket.id;
      player.isConnected = true;
      state.players.push(player);

      gameRooms.set(roomCode, state);

      // Persist to DB
      if (pool) {
        try {
          await pool.execute(
            'INSERT INTO games (id, room_code, password_hash, player_count, status, current_player_index, board_state) VALUES (?,?,?,?,?,?,?)',
            [state.id, roomCode, state.passwordHash, playerCount, 'waiting', 0, JSON.stringify(state)]
          );
          await pool.execute(
            'INSERT INTO players (id, game_id, name, color_index, slot_index, socket_id, is_connected) VALUES (?,?,?,?,?,?,?)',
            [player.id, state.id, player.name, 0, 0, socket.id, true]
          );
        } catch (e) { console.warn('[DB] create_room error:', e.message); }
      }

      socket.join(roomCode);
      socket.data.roomCode    = roomCode;
      socket.data.playerIndex = 0;

      socket.emit('room_created', { roomCode, playerIndex: 0 });
      socket.emit('game_state', sanitizeState(state));
    });

    // ── Join Room ─────────────────────────────────────────────────────────────
    socket.on('join_room', async ({ roomCode, playerName, password }) => {
      const state = gameRooms.get(roomCode);
      if (!state) { socket.emit('error', 'Room not found'); return; }
      if (state.status === 'finished') { socket.emit('error', 'Game already finished'); return; }

      // Password check
      if (state.passwordHash && !(await bcrypt.compare(password || '', state.passwordHash))) {
        socket.emit('error', 'Wrong password'); return;
      }

      // Reconnect existing player?
      const existing = state.players.find(p => p.name === playerName && !p.isConnected);
      if (existing) {
        existing.socketId    = socket.id;
        existing.isConnected = true;
        existing.isAuto      = false;

        // Clear auto timer and pending disconnect-grace timer
        const autoKey = `${roomCode}_${existing.slotIndex}`;
        if (autoTimers.has(autoKey)) { clearTimeout(autoTimers.get(autoKey)); autoTimers.delete(autoKey); }
        if (disconnectTimers.has(autoKey)) { clearTimeout(disconnectTimers.get(autoKey)); disconnectTimers.delete(autoKey); }

        socket.join(roomCode);
        socket.data.roomCode    = roomCode;
        socket.data.playerIndex = existing.slotIndex;

        io.to(roomCode).emit('player_reconnected', existing.slotIndex);
        // Broadcast to the whole room, not just the reconnecting socket —
        // otherwise every other player's UI stays stuck showing the old
        // disconnected/reconnecting state until some unrelated action (a
        // roll, a move) happens to trigger the next game_state broadcast.
        io.to(roomCode).emit('game_state', sanitizeState(state));
        socket.emit('joined', { playerIndex: existing.slotIndex });
        return;
      }

      // New player
      if (state.players.length >= state.playerCount) { socket.emit('error', 'Room is full'); return; }
      if (state.status !== 'waiting')                 { socket.emit('error', 'Game already started'); return; }

      const colorIndex = state.players.length;
      const slotIndex  = state.players.length;
      const player = createPlayer(state.id, playerName, colorIndex, slotIndex);
      player.socketId    = socket.id;
      player.isConnected = true;
      state.players.push(player);

      if (pool) {
        try {
          await pool.execute(
            'INSERT INTO players (id, game_id, name, color_index, slot_index, socket_id, is_connected) VALUES (?,?,?,?,?,?,?)',
            [player.id, state.id, playerName, colorIndex, slotIndex, socket.id, true]
          );
        } catch (e) { console.warn('[DB] join_room insert player error:', e.message); }
      }

      socket.join(roomCode);
      socket.data.roomCode    = roomCode;
      socket.data.playerIndex = slotIndex;

      io.to(roomCode).emit('game_state', sanitizeState(state));
      socket.emit('joined', { playerIndex: slotIndex });

      // Auto-start when room is full
      if (state.players.length === state.playerCount) {
        state.status = 'playing';
        await saveGameState(state);
        io.to(roomCode).emit('game_started', state);
        io.to(roomCode).emit('game_state', sanitizeState(state));
      }
    });

    // ── Roll Dice ─────────────────────────────────────────────────────────────
    socket.on('roll_dice', async () => {
      const { roomCode, playerIndex } = socket.data;
      const state = gameRooms.get(roomCode);
      if (!state || state.status !== 'playing') return;
      if (state.currentPlayerIndex !== playerIndex) return;
      if (state.diceRolled) return;

      const value = Math.floor(Math.random() * 6) + 1;
      state.diceValue  = value;
      state.diceRolled = true;

      io.to(roomCode).emit('dice_rolled', { playerIndex, value });
      io.to(roomCode).emit('game_state', sanitizeState(state));

      // Check if any valid move exists
      const player = state.players[playerIndex];
      const valid  = getValidMoves(player, value, state);
      if (valid.length === 0) {
        // No move possible — skip turn
        setTimeout(async () => {
          if (value !== 6) {
            let next = (playerIndex + 1) % state.playerCount;
            let guard = 0;
            while (state.players[next].isFinished && guard < state.playerCount) {
              next = (next + 1) % state.playerCount; guard++;
            }
            state.currentPlayerIndex = next;
          }
          state.diceRolled = false;
          state.diceValue  = null;
          await saveGameState(state);
          io.to(roomCode).emit('game_state', sanitizeState(state));
        }, 1500);
      }
    });

    // ── Move Piece ────────────────────────────────────────────────────────────
    socket.on('move_piece', async ({ pieceId }) => {
      const { roomCode, playerIndex } = socket.data;
      const state = gameRooms.get(roomCode);
      if (!state || state.status !== 'playing') return;
      if (state.currentPlayerIndex !== playerIndex) return;
      if (!state.diceRolled) return;

      const player = state.players[playerIndex];
      const valid  = getValidMoves(player, state.diceValue, state);
      if (!valid.includes(pieceId)) { socket.emit('error', 'Invalid move'); return; }

      const newState = applyMove(state, playerIndex, pieceId, state.diceValue);
      gameRooms.set(roomCode, newState);
      await saveGameState(newState);

      io.to(roomCode).emit('piece_moved', { playerIndex, pieceId, capturedPieces: newState.lastMove.capturedPieces });
      io.to(roomCode).emit('game_state', sanitizeState(newState));

      if (newState.status === 'finished') {
        io.to(roomCode).emit('game_over', newState.rankings);
        // Update leaderboard
        if (pool) {
          for (const p of newState.players) {
            const wins = p.finishRank === 1 ? 1 : 0;
            try {
              await pool.execute(
                'INSERT INTO leaderboard (player_name, wins, games_played) VALUES (?,?,1) ON DUPLICATE KEY UPDATE wins = wins + ?, games_played = games_played + 1',
                [p.name, wins, wins]
              );
            } catch (e) { console.warn('[DB] leaderboard update error:', e.message); }
          }
        }
        return;
      }

      // Set auto timer for next player if they're offline
      scheduleAutoIfNeeded(io, roomCode, newState);
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const { roomCode, playerIndex } = socket.data || {};
      if (!roomCode) return;
      const state = gameRooms.get(roomCode);
      if (!state) return;

      const player = state.players[playerIndex];
      if (!player) return;
      player.isConnected = false;

      io.to(roomCode).emit('player_left', playerIndex);
      io.to(roomCode).emit('game_state', sanitizeState(state));

      // Grace period before AUTO
      const disconnectKey = `${roomCode}_${playerIndex}`;
      const timer = setTimeout(() => {
        if (player.isConnected) return; // reconnected before the grace period elapsed
        player.isAuto = true;
        io.to(roomCode).emit('player_auto', playerIndex);
        io.to(roomCode).emit('game_state', sanitizeState(state));
        // If it's their turn, auto-handle it
        if (state.status === 'playing' && state.currentPlayerIndex === playerIndex) {
          doAutoTurn(io, roomCode, state);
        }
      }, RECONNECT_GRACE_MS);

      disconnectTimers.set(disconnectKey, timer);
    });
  });

  // ─── AUTO turn logic ─────────────────────────────────────────────────────
  function doAutoTurn(io, roomCode, state) {
    setTimeout(async () => {
      const s = gameRooms.get(roomCode);
      if (!s || s.status !== 'playing') return;
      const pi = s.currentPlayerIndex;
      const player = s.players[pi];
      if (!player || player.isConnected) return; // came back online

      // Roll
      const value = Math.floor(Math.random() * 6) + 1;
      s.diceValue = value; s.diceRolled = true;
      io.to(roomCode).emit('dice_rolled', { playerIndex: pi, value, isAuto: true });

      setTimeout(async () => {
        const s2 = gameRooms.get(roomCode);
        if (!s2) return;
        const pieceId = pickAutoMove(s2.players[pi], value, s2);
        if (pieceId) {
          const newState = applyMove(s2, pi, pieceId, value);
          newState.lastMove = { ...newState.lastMove, playerIndex: pi, pieceId, isAuto: true };
          gameRooms.set(roomCode, newState);
          await saveGameState(newState);
          io.to(roomCode).emit('piece_moved', { playerIndex: pi, pieceId, isAuto: true, capturedPieces: newState.lastMove.capturedPieces });
          io.to(roomCode).emit('game_state', sanitizeState(newState));
          if (newState.status === 'finished') {
            io.to(roomCode).emit('game_over', newState.rankings);
            return;
          }
          scheduleAutoIfNeeded(io, roomCode, newState);
        } else {
          // No valid move — skip
          if (value !== 6) {
            let next = (pi + 1) % s2.playerCount;
            let guard = 0;
            while (s2.players[next].isFinished && guard < s2.playerCount) { next = (next + 1) % s2.playerCount; guard++; }
            s2.currentPlayerIndex = next;
          }
          s2.diceRolled = false; s2.diceValue = null;
          gameRooms.set(roomCode, s2);
          await saveGameState(s2);
          io.to(roomCode).emit('game_state', sanitizeState(s2));
          scheduleAutoIfNeeded(io, roomCode, s2);
        }
      }, AUTO_MOVE_DELAY_MS);
    }, 1500);
  }

  function scheduleAutoIfNeeded(io, roomCode, state) {
    const pi = state.currentPlayerIndex;
    const player = state.players[pi];
    if (!player || player.isConnected || !player.isAuto) return;
    if (state.status !== 'playing') return;
    doAutoTurn(io, roomCode, state);
  }

  // ─── Start HTTP server ────────────────────────────────────────────────────
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`\n🎮 Ludo Game running at:`);
    console.log(`   Local:   http://localhost:${port}`);
    // Get local IP
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`   Network: http://${net.address}:${port}  ← Share this on WiFi`);
        }
      }
    }
    console.log('\n');
  });
});
