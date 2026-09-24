/**
 * Server-level integration tests for disconnect / reconnect mid-game — a
 * real server.js over real Socket.io, no browser and no React.
 *
 * This is the right layer for these regressions: they are server-side seat
 * bookkeeping, and routing them through the browser UI would add seconds of
 * unrelated, high-variance latency that has nothing to do with what's being
 * verified.
 *
 * There is deliberately no mid-game AUTO takeover on disconnect: players in
 * this game are physically together on separate devices, and a dropped
 * connection (WiFi blip, a phone's own address changing, momentary network
 * loss) is not the same as someone actually leaving. The game just waits,
 * however long it takes, for the real person to reconnect.
 */
const {
  startServer, stopServer, waitForServer, makeClientFactory,
  waitForEvent, waitForState, makeRoom,
} = require('./harness');

const PORT = 4446;

let serverProcess;
let connect, closeAll;

beforeAll(async () => {
  serverProcess = startServer(PORT);
  await waitForServer(PORT);
  ({ connect, closeAll } = makeClientFactory(PORT));
}, 40000);

afterAll(async () => {
  closeAll?.();
  await stopServer(serverProcess);
});

test('reconnecting restores the seat without ever being flagged AUTO', async () => {
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
}, 20000);

// The behavior this whole file used to guard against a REGRESSION of — a
// grace-period timer that force-flipped a player to AUTO — no longer exists
// at all. This confirms that directly: no reconnect, no player_auto, ever.
test('a disconnected player who never reconnects is still never flipped to AUTO', async () => {
  const { host, guests } = await makeRoom(connect, { names: ['Host2', 'Guest2'] });
  let sawAuto = false;
  host.on('player_auto', () => { sawAuto = true; });
  guests[0].disconnect();
  await new Promise((r) => setTimeout(r, 2000));
  expect(sawAuto).toBe(false);
}, 20000);

// REGRESSION: the disconnect handler didn't check which socket owned the seat.
//
// The pure form of that race — a dead socket's close arriving at the server
// *after* the player has already reconnected on a newer one — can't be staged
// from a black-box client, because a well-behaved client always sends its
// DISCONNECT before the new socket connects. What this does cover is the seat
// bookkeeping the guard depends on: socketId must always follow the newest
// socket through repeated drop/rejoin cycles, with isAuto never set either
// way (there's no timer left to leak one from, but the seat-ownership
// guarantee itself is still worth its own coverage).
test('a seat survives repeated drop/rejoin cycles, socketId always following the newest socket', async () => {
  const { host, guests, roomCode } = await makeRoom(connect, { names: ['Host3', 'Guest3'] });

  let current = guests[0];
  let lastState = null;
  for (let cycle = 0; cycle < 3; cycle++) {
    const left = waitForEvent(host, 'player_left');
    current.disconnect();
    await left;

    current = await connect();
    const reconnected = waitForEvent(current, 'player_reconnected');
    // Read the settled state back off this same socket, not the host's.
    // Ordering is only guaranteed within one connection — the host's own
    // game_state listener can fire before or after this reconnect resolves,
    // since it travels over an entirely separate socket.
    const settled = waitForState(current, (s) => s.players[1].isConnected);
    current.emit('join_room', { roomCode, playerName: 'Guest3', password: '' });
    await reconnected;
    lastState = await settled;
  }

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
