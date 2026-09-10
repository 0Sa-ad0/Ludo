/**
 * Server-level integration tests for turn flow, host controls and input
 * validation. Timers are shortened via env so these run in seconds.
 */
const {
  startServer, stopServer, waitForServer, makeClientFactory,
  waitForEvent, waitForState, makeRoom,
} = require('./harness');

const PORT = 4447;

let serverProcess;
let connect, closeAll;

beforeAll(async () => {
  serverProcess = startServer(PORT, {
    RECONNECT_GRACE_MS: '400',
    AUTO_MOVE_DELAY_MS: '150',
    SKIP_NOTICE_MS:     '150',
  });
  await waitForServer(PORT);
  ({ connect, closeAll } = makeClientFactory(PORT));
}, 40000);

afterAll(async () => {
  closeAll?.();
  await stopServer(serverProcess);
});

// ─── Input validation ───────────────────────────────────────────────────────

describe('input validation', () => {
  test.each([
    ['zero players', 0],
    ['one player', 1],
    ['seven players', 7],
    ['a fraction', 2.5],
    ['a string', 'four'],
  ])('rejects a room with %s', async (_label, playerCount) => {
    const socket = await connect();
    const err = waitForEvent(socket, 'error');
    socket.emit('create_room', { playerCount, playerName: 'Nobody' });
    expect(await err).toMatch(/player count/i);
  }, 15000);

  test('rejects a blank player name', async () => {
    const socket = await connect();
    const err = waitForEvent(socket, 'error');
    socket.emit('create_room', { playerCount: 2, playerName: '   ' });
    expect(await err).toMatch(/name/i);
  }, 15000);

  test('rejects a duplicate name in the same room', async () => {
    const { roomCode } = await makeRoom(connect, { playerCount: 4, names: ['Ann', 'Bob'] });
    const third = await connect();
    const err = waitForEvent(third, 'error');
    third.emit('join_room', { roomCode, playerName: 'Bob' });
    expect(await err).toMatch(/already taken/i);
  }, 15000);

  test('rejects an unknown room code', async () => {
    const socket = await connect();
    const err = waitForEvent(socket, 'error');
    socket.emit('join_room', { roomCode: 'ZZZZZZ', playerName: 'Ghost' });
    expect(await err).toMatch(/not found/i);
  }, 15000);

  test('rejects a wrong password', async () => {
    const host = await connect();
    const created = waitForEvent(host, 'room_created');
    host.emit('create_room', { playerCount: 2, playerName: 'Keeper', password: 'letmein' });
    const { roomCode } = await created;

    const guest = await connect();
    const err = waitForEvent(guest, 'error');
    guest.emit('join_room', { roomCode, playerName: 'Intruder', password: 'wrong' });
    expect(await err).toMatch(/password/i);
  }, 15000);
});

// ─── Host controls ──────────────────────────────────────────────────────────

describe('host controls', () => {
  test('the host can start a 4-seat room with only 3 players, and the board shrinks to fit', async () => {
    const { host } = await makeRoom(connect, {
      playerCount: 4, names: ['H', 'G1', 'G2'],
    });
    const started = waitForEvent(host, 'game_started');
    host.emit('start_game');
    const state = await started;
    expect(state.status).toBe('playing');
    // playerCount follows who actually turned up — this is also what picks the
    // square board over the hex one.
    expect(state.playerCount).toBe(3);
    expect(state.players).toHaveLength(3);
  }, 15000);

  test('a non-host cannot start the game', async () => {
    const { guests } = await makeRoom(connect, { playerCount: 4, names: ['H2', 'G3'] });
    const err = waitForEvent(guests[0], 'error');
    guests[0].emit('start_game');
    expect(await err).toMatch(/only the host/i);
  }, 15000);

  test('the host cannot start below the minimum player count', async () => {
    const host = await connect();
    const created = waitForEvent(host, 'room_created');
    host.emit('create_room', { playerCount: 4, playerName: 'Lonely' });
    await created;

    const err = waitForEvent(host, 'error');
    host.emit('start_game');
    expect(await err).toMatch(/at least/i);
  }, 15000);

  test('the host can remove a player from the lobby, and slots close up', async () => {
    const { host, guests } = await makeRoom(connect, {
      playerCount: 4, names: ['H3', 'G4', 'G5'],
    });
    const kicked = waitForEvent(guests[0], 'kicked');
    // G5 should be renumbered from slot 2 down to slot 1.
    const reslotted = waitForEvent(guests[1], 'joined');
    // Attach before emitting: the server broadcasts the new state in the same
    // turn it sends 'kicked', so a listener added afterwards misses it.
    const settled = waitForState(host, (s) => s.players.length === 2);

    host.emit('kick_player', { slotIndex: 1 });

    await kicked;
    expect((await reslotted).playerIndex).toBe(1);

    const state = await settled;
    expect(state.players.map((p) => p.name)).toEqual(['H3', 'G5']);
    expect(state.players.map((p) => p.slotIndex)).toEqual([0, 1]);
    // Piece ids embed the slot, so they must have been rebuilt too.
    expect(state.players[1].pieces[0].id).toBe('p1_piece0');
  }, 15000);

  test('a non-host cannot remove anyone', async () => {
    const { guests } = await makeRoom(connect, { playerCount: 4, names: ['H4', 'G6', 'G7'] });
    const err = waitForEvent(guests[0], 'error');
    guests[0].emit('kick_player', { slotIndex: 0 });
    expect(await err).toMatch(/only the host/i);
  }, 15000);
});

// ─── Turn flow ──────────────────────────────────────────────────────────────

describe('turn flow', () => {
  // Players in this game are physically together on separate devices —
  // someone thinking or chatting is not the same as someone gone, so a
  // connected player who just hasn't rolled yet must NOT have their turn
  // taken from them, no matter how long they sit on it.
  test('a connected player who has not rolled keeps their turn indefinitely', async () => {
    const { host } = await makeRoom(connect, { names: ['Patient', 'Waiter'] });
    let autoRolled = false;
    host.on('dice_rolled', ({ isAuto }) => { if (isAuto) autoRolled = true; });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(autoRolled).toBe(false);
  }, 15000);

  // The safety net that DOES still exist: a genuinely dropped connection
  // (not just a slow one) still eventually gets its turn played for it, so
  // one dead phone can't freeze the room for the other three forever. Drop
  // the player whose turn it currently is (slot 0, at game start) and watch
  // through the OTHER socket, since the dropped one obviously can't observe
  // its own disconnect.
  test('a disconnected player is flipped to AUTO and their turn gets played', async () => {
    const { host, guests } = await makeRoom(connect, { names: ['Dropped', 'Stayer'] });
    const auto = waitForEvent(guests[0], 'player_auto');
    host.disconnect();
    expect(await auto).toBe(0);

    const rolled = await waitForEvent(guests[0], 'dice_rolled');
    expect(rolled.playerIndex).toBe(0);
    expect(rolled.isAuto).toBe(true);
  }, 15000);

  test('a player who leaves mid-game is handed to AUTO without renumbering seats', async () => {
    const { host, guests } = await makeRoom(connect, { names: ['Stayer', 'Leaver'] });
    const auto = waitForEvent(host, 'player_auto');
    // Attached before the emit — player_auto and game_state arrive together.
    const settled = waitForState(host, (s) => s.players[1].isAuto);
    guests[0].emit('leave_room');
    expect(await auto).toBe(1);

    const state = await settled;
    expect(state.players).toHaveLength(2);
    expect(state.players[1].name).toBe('Leaver');
  }, 15000);

  // Someone who closes their tab in the lobby used to hold their seat for
  // ever, so the room could never fill and never start.
  test('a lobby seat is released when its owner never comes back', async () => {
    const { host, guests } = await makeRoom(connect, { playerCount: 4, names: ['Keeper', 'Vanisher'] });
    const settled = waitForState(host, (s) => s.players.length === 1, 8000);
    guests[0].disconnect();
    const state = await settled;
    expect(state.players.map((p) => p.name)).toEqual(['Keeper']);
    expect(state.status).toBe('waiting');
  }, 20000);

  test('but a lobby seat survives a quick reconnect, keeping the same slot', async () => {
    const { host, guests, roomCode } = await makeRoom(connect, {
      playerCount: 4, names: ['Keeper2', 'Refresher', 'Third'],
    });

    let lastState = null;
    host.on('game_state', (s) => { lastState = s; });

    guests[0].disconnect(); // Refresher reloads the page

    const back = await connect();
    const joined = waitForEvent(back, 'joined');
    back.emit('join_room', { roomCode, playerName: 'Refresher' });
    // Same slot as before — a refresh must not renumber anyone.
    expect((await joined).playerIndex).toBe(1);

    // Sit well past the grace period; the seat must not be swept out from
    // under a player who is sitting right there.
    await new Promise((r) => setTimeout(r, 900));

    expect(lastState.players).toHaveLength(3);
    expect(lastState.players.map((p) => p.name)).toEqual(['Keeper2', 'Refresher', 'Third']);
    expect(lastState.players[1].isConnected).toBe(true);
  }, 20000);

  test('leaving the lobby before the game starts frees the seat entirely', async () => {
    const { host, guests } = await makeRoom(connect, { playerCount: 4, names: ['Stay2', 'Go'] });
    const settled = waitForState(host, (s) => s.players.length === 1);
    guests[0].emit('leave_room');
    const state = await settled;
    expect(state.status).toBe('waiting');
    expect(state.players[0].name).toBe('Stay2');
  }, 15000);
});
