/**
 * 2v2 rooms over a real server.js + Socket.io: team assignment in the lobby,
 * the guards around it, and partners being re-seated opposite each other at
 * the start — with every client told its new seat.
 *
 * Deliberately runs with the server's DEFAULT skip timing (no
 * SKIP_NOTICE_MS override), because the last test guards that default.
 */
const {
  startServer, stopServer, waitForServer, makeClientFactory,
  waitForEvent, waitForState,
} = require('./harness');

// Every integration suite needs its own port (full-playthrough has 4448).
const PORT = 4449;

let serverProcess;
let connect, closeAll;

beforeAll(async () => {
  serverProcess = startServer(PORT, { LOBBY_RECONNECT_GRACE_MS: '400' });
  await waitForServer(PORT);
  ({ connect, closeAll } = makeClientFactory(PORT));
}, 40000);

afterAll(async () => {
  closeAll?.();
  await stopServer(serverProcess);
});

/** Connect, remembering the latest seat the server assigned this socket. */
async function seat() {
  const socket = await connect();
  socket.lastIndex = null;
  socket.on('joined', ({ playerIndex }) => { socket.lastIndex = playerIndex; });
  socket.on('room_created', ({ playerIndex }) => { socket.lastIndex = playerIndex; });
  return socket;
}

async function createTeamRoom(hostName) {
  const host = await seat();
  const created = waitForEvent(host, 'room_created');
  host.emit('create_room', { playerCount: 4, playerName: hostName, teamMode: true });
  const { roomCode } = await created;
  return { host, roomCode };
}

async function join(roomCode, name) {
  const s = await seat();
  const joined = waitForEvent(s, 'joined');
  s.emit('join_room', { roomCode, playerName: name });
  await joined;
  return s;
}

test('a team room must be exactly 4 players', async () => {
  const s = await connect();
  const err = waitForEvent(s, 'error');
  s.emit('create_room', { playerCount: 3, playerName: 'Odd', teamMode: true });
  expect(await err).toMatch(/exactly 4/i);
}, 15000);

test('joiners are balanced across teams, and can switch while there is room', async () => {
  const { host, roomCode } = await createTeamRoom('TH1');
  const a = await join(roomCode, 'TA1');

  // Host is Team A, so the first joiner lands on Team B.
  const afterSwitch = waitForState(host, (s) => s.players[1]?.team === 0);
  a.emit('choose_team', { team: 0 });
  const state = await afterSwitch;
  expect(state.players.map((p) => p.team)).toEqual([0, 0]);

  // Team A is now full — a third player can't switch onto it.
  const b = await join(roomCode, 'TB1');
  const err = waitForEvent(b, 'error');
  b.emit('choose_team', { team: 0 });
  expect(await err).toMatch(/team is full/i);
}, 20000);

test('the host cannot start a team game early', async () => {
  const { host, roomCode } = await createTeamRoom('TH2');
  await join(roomCode, 'TA2');
  const err = waitForEvent(host, 'error');
  host.emit('start_game');
  expect(await err).toMatch(/all 4/i);
}, 20000);

test('choose_team is refused in a normal room and once the game has started', async () => {
  const solo = await seat();
  const created = waitForEvent(solo, 'room_created');
  solo.emit('create_room', { playerCount: 2, playerName: 'Solo' });
  await created;
  const err1 = waitForEvent(solo, 'error');
  solo.emit('choose_team', { team: 1 });
  expect(await err1).toMatch(/not a team game/i);

  const { host, roomCode } = await createTeamRoom('TH3');
  const started = waitForEvent(host, 'game_started');
  for (const n of ['TX3', 'TY3', 'TZ3']) await join(roomCode, n);
  await started;
  const err2 = waitForEvent(host, 'error');
  host.emit('choose_team', { team: 1 });
  expect(await err2).toMatch(/locked/i);
}, 25000);

test('at the start, partners are seated opposite, colours kept, and every client learns its new seat', async () => {
  const { host, roomCode } = await createTeamRoom('TH4');
  // Join order puts both Team A players first: H, X then Y, Z — so seating
  // has to actually move people for partners to end up opposite.
  const x = await join(roomCode, 'TX4');
  const toA = waitForState(host, (s) => s.players[1]?.team === 0);
  x.emit('choose_team', { team: 0 });
  const lobby = await toA;
  const colourBefore = Object.fromEntries(lobby.players.map((p) => [p.name, p.colorIndex]));

  const y = await join(roomCode, 'TY4');
  // The last joiner is created and listening BEFORE it joins: its join is
  // what starts the game, so its game_started can arrive straight away.
  const z = await seat();
  // Each socket's own game_started — ordering is only guaranteed within one
  // connection, and the server sends a socket its new seat ('joined') before
  // game_started on that same connection. Waiting on the host's alone would
  // race the other sockets' seat updates.
  const starts = [host, x, y, z].map((s) => waitForEvent(s, 'game_started'));
  z.emit('join_room', { roomCode, playerName: 'TZ4' });
  const [state] = await Promise.all(starts);

  expect(state.teamMode).toBe(true);
  expect(state.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
  expect(state.players[0].name).toBe('TH4');
  expect(state.players[0].isHost).toBe(true);

  const byName = Object.fromEntries(state.players.map((p) => [p.name, p]));
  colourBefore.TY4 = byName.TY4.colorIndex; // joined after the snapshot
  colourBefore.TZ4 = byName.TZ4.colorIndex;
  for (const p of state.players) expect(p.colorIndex).toBe(colourBefore[p.name]);

  // Each socket's seat must match where its name now actually sits —
  // otherwise it would roll and move pieces for somebody else.
  for (const [socket, name] of [[host, 'TH4'], [x, 'TX4'], [y, 'TY4'], [z, 'TZ4']]) {
    expect(socket.lastIndex).toBe(byName[name].slotIndex);
  }
  expect(new Set(state.players.map((p) => p.slotIndex))).toEqual(new Set([0, 1, 2, 3]));
}, 30000);

// LOOPHOLE: a removed partner stops counting toward the team's win, so a
// host who was already home could remove their own partner and win on the
// spot. Partners can't be removed mid-game; opponents still can.
test('mid-game, the host cannot remove their own partner, but can remove an opponent', async () => {
  const { host, roomCode } = await createTeamRoom('TH5');
  const others = [await join(roomCode, 'TX5'), await join(roomCode, 'TY5')];
  const last = await seat();
  const started = waitForEvent(host, 'game_started');
  last.emit('join_room', { roomCode, playerName: 'TZ5' });
  const state = await started;
  others.push(last);

  // Host is slot 0 (Team A); slot 2 is the partner, slots 1 and 3 opponents.
  expect(state.players[2].team).toBe(state.players[0].team);
  const err = waitForEvent(host, 'error');
  host.emit('kick_player', { slotIndex: 2 });
  expect(await err).toMatch(/own partner/i);

  const removed = waitForState(host, (s) => s.players[1].isFinished);
  host.emit('kick_player', { slotIndex: 1 });
  const after = await removed;
  expect(after.players[2].isFinished).toBe(false);
  expect(after.status).toBe('playing');
}, 25000);

// REGRESSION: a dead roll used to pass the turn after 1.4s — while the
// roller's dice was still animating (3s), so the next player's name showed up
// and gave the result away. The turn must not move before the dice lands.
test('a dead roll does not pass the turn before the dice animation has finished', async () => {
  // Only the very first roll of a fresh game is used: with every piece still
  // at home, anything but a 6 is guaranteed to be a dead roll. (Carrying on
  // after a 6 isn't safe — a second 6 leaves the player a real choice, and
  // the game rightly waits for them indefinitely.)
  for (let attempt = 0; attempt < 10; attempt++) {
    const host = await seat();
    const created = waitForEvent(host, 'room_created');
    host.emit('create_room', { playerCount: 2, playerName: `Timer${attempt}` });
    const { roomCode } = await created;
    const started = waitForEvent(host, 'game_started');
    await join(roomCode, `Timed${attempt}`);
    await started;

    const rolled = waitForEvent(host, 'dice_rolled');
    host.emit('roll_dice');
    const { value } = await rolled;
    const rolledAt = Date.now();
    if (value === 6) continue;

    await waitForState(host, (s) => s.currentPlayerIndex === 1, 15000);
    expect(Date.now() - rolledAt).toBeGreaterThanOrEqual(3000);
    return;
  }
  throw new Error('rolled a 6 on every one of 10 fresh games');
}, 90000);
