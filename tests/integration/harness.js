/**
 * Shared harness for the server-level integration suites: boots a real
 * server.js in a child process and hands out real Socket.io clients.
 *
 * Readiness is probed with an actual socket connection rather than an HTTP
 * GET. The socket server is attached the moment the process starts listening,
 * whereas a GET on "/" makes Next compile a page on demand — several seconds
 * of unrelated work that used to make these suites time out intermittently
 * whenever the machine was busy.
 */
const { spawn } = require('child_process');
const path      = require('path');
const { io }    = require('socket.io-client');

const OPTS = { path: '/api/socket', transports: ['websocket'] };

function startServer(port, env = {}) {
  const child = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(port),
      // Isolated, nonexistent DB so integration runs never touch real data —
      // server.js degrades gracefully to in-memory-only when it can't connect.
      DB_NAME: 'ludo_game_integration_test',
      ...env,
    },
    stdio: 'ignore',
  });
  return child;
}

/** Resolve once the socket server is actually accepting connections. */
function waitForServer(port, timeoutMs = 30000) {
  const url = `http://localhost:${port}`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const probe = io(url, { ...OPTS, timeout: 1000, reconnection: false });
      probe.on('connect', () => { probe.disconnect(); resolve(); });
      probe.on('connect_error', () => {
        probe.close();
        if (Date.now() - start > timeoutMs) reject(new Error('server did not start in time'));
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

/** A connected client, tracked so the suite can close every one at the end. */
function makeClientFactory(port) {
  const open = new Set();
  const url = `http://localhost:${port}`;

  const connect = () => new Promise((resolve) => {
    const socket = io(url, OPTS);
    open.add(socket);
    socket.on('connect', () => resolve(socket));
  });

  // Sockets left open keep Jest's event loop alive and produce "worker failed
  // to exit gracefully" warnings, so close every one we handed out.
  const closeAll = () => {
    for (const s of open) s.disconnect();
    open.clear();
  };

  return { connect, closeAll };
}

const waitForEvent = (socket, event) => new Promise((resolve) => socket.once(event, resolve));

/**
 * Resolve on the first game_state that satisfies `predicate`.
 *
 * The timeout is generous on purpose: these suites drive a real server
 * process, so on a loaded machine a few seconds of scheduling jitter is
 * normal and has nothing to do with what's being asserted.
 */
function waitForState(socket, predicate, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('game_state', onState);
      reject(new Error('timed out waiting for expected game_state'));
    }, timeoutMs);
    const onState = (state) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off('game_state', onState);
      resolve(state);
    };
    socket.on('game_state', onState);
  });
}

/** Create a room and fill it, returning the host + guest sockets. */
async function makeRoom(connect, { playerCount = 2, names = ['Host', 'Guest'], password = '' } = {}) {
  const host = await connect();
  const created = waitForEvent(host, 'room_created');
  host.emit('create_room', { playerCount, playerName: names[0], password });
  const { roomCode } = await created;

  const guests = [];
  for (const name of names.slice(1)) {
    const guest = await connect();
    const joined = waitForEvent(guest, 'joined');
    guest.emit('join_room', { roomCode, playerName: name, password });
    await joined;
    guests.push(guest);
  }
  return { host, guests, roomCode };
}

module.exports = {
  OPTS, startServer, waitForServer, makeClientFactory,
  waitForEvent, waitForState, makeRoom,
};
