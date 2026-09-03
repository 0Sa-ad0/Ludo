/**
 * Server-level integration test for the disconnect/reconnect timer logic —
 * talks to a real running server.js instance over real Socket.io connections,
 * with no browser/React involved. This is the right layer for this specific
 * regression: it's a server-side timer-bookkeeping guarantee, and routing it
 * through the browser UI adds multiple seconds of unrelated, high-variance
 * latency (Next.js dev compile, React Strict Mode's dev-only double-connect,
 * click retries) that has nothing to do with what's actually being verified.
 *
 * REGRESSION covered: disconnectTimers used to be keyed by the old
 * socket.id and never cleared on reconnect, so a player who reconnected
 * within the grace period still got force-flipped into AUTO when the
 * original timer fired later, hijacking their turn mid-game.
 */
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 4446;
const GRACE_MS = 800;
const URL = `http://localhost:${PORT}`;
const OPTS = { path: '/api/socket', transports: ['websocket'] };

let serverProcess;

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      require('http').get(url, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) reject(new Error('server did not start in time'));
          else setTimeout(tryOnce, 300);
        });
    };
    tryOnce();
  });
}

function connect() {
  return new Promise((resolve) => {
    const socket = io(URL, OPTS);
    socket.on('connect', () => resolve(socket));
  });
}

function waitForEvent(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

beforeAll(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '../..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      RECONNECT_GRACE_MS: String(GRACE_MS),
      DB_NAME: 'ludo_game_integration_test',
    },
    stdio: 'ignore',
  });
  await waitForServer(URL);
}, 20000);

afterAll(() => {
  if (serverProcess) serverProcess.kill();
});

test('reconnecting within the grace period cancels the pending AUTO flip', async () => {
  const host = await connect();
  const roomCreated = waitForEvent(host, 'room_created');
  host.emit('create_room', { playerCount: 2, playerName: 'Host', password: '' });
  const { roomCode } = await roomCreated;

  const guest = await connect();
  const guestJoined = waitForEvent(guest, 'joined');
  guest.emit('join_room', { roomCode, playerName: 'Guest', password: '' });
  await guestJoined;

  const hostSeesDisconnect = waitForEvent(host, 'player_left');
  guest.disconnect();
  await hostSeesDisconnect;

  // Reconnect well within the grace period.
  const guest2 = await connect();
  const reconnected = waitForEvent(guest2, 'player_reconnected');
  guest2.emit('join_room', { roomCode, playerName: 'Guest', password: '' });
  await reconnected;

  const stateAfterReconnect = await new Promise((resolve) => {
    guest2.once('game_state', resolve);
  });
  expect(stateAfterReconnect.players[1].isConnected).toBe(true);
  expect(stateAfterReconnect.players[1].isAuto).toBe(false);

  // Wait past the ORIGINAL grace period. If the disconnect timer wasn't
  // cancelled on reconnect, it fires here and force-flips Guest to AUTO
  // even though they're actively connected.
  let sawAuto = false;
  const autoWatcher = (state) => {
    const g = state.players[1];
    if (g.isAuto) sawAuto = true;
  };
  guest2.on('game_state', autoWatcher);
  await new Promise((r) => setTimeout(r, GRACE_MS + 500));
  guest2.off('game_state', autoWatcher);

  expect(sawAuto).toBe(false);

  host.disconnect();
  guest2.disconnect();
}, 15000);

test('sanity check: NOT reconnecting still flips to AUTO after the grace period (proves the timer mechanism itself works)', async () => {
  const host = await connect();
  const roomCreated = waitForEvent(host, 'room_created');
  host.emit('create_room', { playerCount: 2, playerName: 'Host2', password: '' });
  const { roomCode } = await roomCreated;

  const guest = await connect();
  const guestJoined = waitForEvent(guest, 'joined');
  guest.emit('join_room', { roomCode, playerName: 'Guest2', password: '' });
  await guestJoined;

  const autoEvent = waitForEvent(host, 'player_auto');
  guest.disconnect();
  await autoEvent; // never reconnects — should fire within the grace period

  host.disconnect();
}, 15000);
