/**
 * Server-level integration tests for the disconnect / reconnect / AUTO timer
 * logic — a real server.js over real Socket.io, no browser and no React.
 *
 * This is the right layer for these regressions: they are all server-side
 * timer bookkeeping, and routing them through the browser UI would add
 * seconds of unrelated, high-variance latency that has nothing to do with
 * what's being verified.
 */
const {
  startServer, waitForServer, makeClientFactory,
  waitForEvent, waitForState, makeRoom,
} = require('./harness');

const PORT     = 4446;
const GRACE_MS = 800;

let serverProcess;
let connect, closeAll;

beforeAll(async () => {
  serverProcess = startServer(PORT, {
    RECONNECT_GRACE_MS: String(GRACE_MS),
    // Long enough that the idle-turn watchdog never fires during these tests
    // and muddies what they're actually measuring.
    TURN_TIMEOUT_MS: '60000',
  });
  await waitForServer(PORT);
  ({ connect, closeAll } = makeClientFactory(PORT));
}, 40000);

afterAll(() => {
  closeAll?.();
  serverProcess?.kill();
});

// REGRESSION: disconnectTimers used to be keyed by the old socket.id and were
// never cleared on reconnect, so a player who reconnected inside the grace
// period still got force-flipped into AUTO when the original timer fired.
test('reconnecting within the grace period cancels the pending AUTO flip', async () => {
  const { host, guests, roomCode } = await makeRoom(connect);
  const [guest] = guests;

  const hostSeesDisconnect = waitForEvent(host, 'player_left');
  guest.disconnect();
  await hostSeesDisconnect;

  const guest2 = await connect();
  const reconnected = waitForEvent(guest2, 'player_reconnected');
  // Attach the state waiter before emitting: the server sends
  // player_reconnected and game_state in the same tick, so a listener added
  // after awaiting the first one can miss the second entirely.
  const settled = waitForState(guest2, (s) => s.players[1].isConnected);
  guest2.emit('join_room', { roomCode, playerName: 'Guest', password: '' });
  await reconnected;

  const state = await settled;
  expect(state.players[1].isAuto).toBe(false);

  // Wait past the ORIGINAL grace period. If its timer wasn't cancelled it
  // fires here and flips an actively-connected player to AUTO.
  let sawAuto = false;
  const watch = (s) => { if (s.players[1].isAuto) sawAuto = true; };
  guest2.on('game_state', watch);
  await new Promise((r) => setTimeout(r, GRACE_MS + 500));
  guest2.off('game_state', watch);

  expect(sawAuto).toBe(false);
}, 20000);

test('sanity check: NOT reconnecting still flips to AUTO after the grace period', async () => {
  const { host, guests } = await makeRoom(connect, { names: ['Host2', 'Guest2'] });
  const autoEvent = waitForEvent(host, 'player_auto');
  guests[0].disconnect();
  await autoEvent;
}, 20000);

// REGRESSION: the disconnect handler didn't check which socket owned the seat.
//
// The pure form of that race — a dead socket's close arriving at the server
// *after* the player has already reconnected on a newer one — can't be staged
// from a black-box client, because a well-behaved client always sends its
// DISCONNECT before the new socket connects. What this does cover is the seat
// bookkeeping the guard depends on: socketId must follow the newest socket,
// and each reconnect must cancel the previous socket's pending AUTO timer.
// Without that, one of these cycles leaves a stale timer running and the
// player is flipped to AUTO while actively connected.
test('a seat survives repeated drop/rejoin cycles without ever flipping to AUTO', async () => {
  const { host, guests, roomCode } = await makeRoom(connect, { names: ['Host3', 'Guest3'] });

  let sawAuto = false;
  let lastState = null;
  host.on('game_state', (s) => {
    lastState = s;
    if (s.players[1].isAuto) sawAuto = true;
  });

  let current = guests[0];
  for (let cycle = 0; cycle < 3; cycle++) {
    const left = waitForEvent(host, 'player_left');
    current.disconnect();
    await left;

    current = await connect();
    const reconnected = waitForEvent(current, 'player_reconnected');
    current.emit('join_room', { roomCode, playerName: 'Guest3', password: '' });
    await reconnected;
  }

  // Sit well past the grace period; a timer leaked by any earlier cycle
  // fires in here.
  await new Promise((r) => setTimeout(r, GRACE_MS + 600));

  expect(sawAuto).toBe(false);
  expect(lastState.players[1].isConnected).toBe(true);
  expect(lastState.players[1].isAuto).toBe(false);
}, 30000);

test('the game_started broadcast never carries the room password hash', async () => {
  const host = await connect();
  const created = waitForEvent(host, 'room_created');
  host.emit('create_room', { playerCount: 2, playerName: 'Host4', password: 'hunter2' });
  const { roomCode } = await created;

  const started = waitForEvent(host, 'game_started');
  const guest = await connect();
  guest.emit('join_room', { roomCode, playerName: 'Guest4', password: 'hunter2' });

  const payload = await started;
  expect(payload.status).toBe('playing');
  expect('passwordHash' in payload).toBe(false);
}, 20000);
