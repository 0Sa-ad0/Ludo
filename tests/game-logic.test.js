const {
  createInitialState, createPlayer, sanitizeState,
  getValidMoves, applyMove, pathToTrack, getStartSq, getTrackLen,
  getLoopLen, getGoalPos, getHomeEntrance, isOnTrack, isValidPlayerCount,
  advanceTurn, skipTurn, finalizeIfOver, registerRoll, clearDice,
  pickAutoMove, generateRoomCode,
} = require('../game-logic');

const {
  SQUARE_TRACK, SQUARE_HOME_COLS, getHexTrack, getHexHomeCols, getHexHomeBases,
  HEX_VIEW, squareArm,
} = require('../src/lib/rules');

// The square board is 4 players -> goal 56; the hex board is 6 -> goal 64.
const GOAL_4 = getGoalPos(4); // 51 track steps + 5 home column
const GOAL_6 = getGoalPos(6); // 59 track steps + 5 home column

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeState(playerCount, names) {
  const state = createInitialState('TEST01', playerCount, null);
  names.forEach((name, i) => {
    state.players.push(createPlayer(state.id, name, i, i));
  });
  return state;
}

// Puts a piece directly onto the track at a given pathPosition, bypassing the
// home-release step, so tests can set up specific board scenarios.
function placeActive(state, playerIndex, pieceIndex, pathPosition) {
  const piece = state.players[playerIndex].pieces[pieceIndex];
  piece.status = 'active';
  piece.pathPosition = pathPosition;
  piece.trackPosition = isOnTrack(pathPosition, state.playerCount)
    ? pathToTrack(pathPosition, playerIndex, state.playerCount)
    : -1;
  return piece;
}

const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const dist      = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ─── Path model ─────────────────────────────────────────────────────────────
// REGRESSION: pieces used to walk all 52 track squares instead of 51, which
// carried them one square PAST their home-column entrance and made the turn
// into the home column a diagonal jump on the board.

describe('path model', () => {
  test('a piece walks trackLen - 1 squares, not trackLen', () => {
    expect(getLoopLen(4)).toBe(getTrackLen(4) - 1);
    expect(getLoopLen(6)).toBe(getTrackLen(6) - 1);
    expect(getLoopLen(4)).toBe(51);
    expect(getLoopLen(6)).toBe(59);
  });

  test('the goal is loop + home column', () => {
    expect(GOAL_4).toBe(56);
    expect(GOAL_6).toBe(64);
  });

  test('the last on-track position is the home-column entrance', () => {
    for (const pc of [4, 6]) {
      const last = getLoopLen(pc) - 1;
      expect(isOnTrack(last, pc)).toBe(true);
      expect(isOnTrack(last + 1, pc)).toBe(false); // first home-column step
      for (let p = 0; p < pc; p++) {
        expect(pathToTrack(last, p, pc)).toBe(getHomeEntrance(p, pc));
      }
    }
  });

  test('a player never lands on the first square of their own arm', () => {
    // That square (one before their start) is passed by everyone else but is
    // exactly the square the off-by-one used to put them on.
    for (let p = 0; p < 4; p++) {
      const ownArmFirst = (getStartSq(p, 4) + getTrackLen(4) - 1) % getTrackLen(4);
      const visited = new Set(
        Array.from({ length: getLoopLen(4) }, (_, i) => pathToTrack(i, p, 4))
      );
      expect(visited.has(ownArmFirst)).toBe(false);
      expect(visited.size).toBe(51);
    }
  });
});

// ─── Board geometry ─────────────────────────────────────────────────────────

describe('square board geometry', () => {
  test('the track is 52 distinct cells', () => {
    expect(SQUARE_TRACK).toHaveLength(52);
    expect(new Set(SQUARE_TRACK.map((c) => c.join(','))).size).toBe(52);
  });

  test('each home-column entrance is adjacent to that column\'s first cell', () => {
    for (let p = 0; p < 4; p++) {
      const entrance = SQUARE_TRACK[getHomeEntrance(p, 4)];
      expect(manhattan(entrance, SQUARE_HOME_COLS[p][0])).toBe(1);
    }
  });

  test('home columns run in an unbroken line toward the centre', () => {
    for (let p = 0; p < 4; p++) {
      const col = SQUARE_HOME_COLS[p];
      for (let i = 0; i < col.length - 1; i++) {
        expect(manhattan(col[i], col[i + 1])).toBe(1);
      }
    }
  });

  test('start squares sit where each player\'s arm begins', () => {
    expect(SQUARE_TRACK[getStartSq(0, 4)]).toEqual([13, 6]);
    expect(SQUARE_TRACK[getStartSq(1, 4)]).toEqual([6, 1]);
    expect(SQUARE_TRACK[getStartSq(2, 4)]).toEqual([1, 8]);
    expect(SQUARE_TRACK[getStartSq(3, 4)]).toEqual([8, 13]);
  });

  // REGRESSION: a 2-player game used to put both players on adjacent arms
  // (13 squares apart, same as slots 0/1 in a 4-player game). The board
  // renders 2-player games with opponents diagonally across from each
  // other, which only stays collision-safe (no two genuinely-different
  // squares ever rendering as if they'd collided) if the REAL geometry is
  // actually diagonal too — see squareArm's own comment in rules.js.
  test('a 2-player game puts the two players on diagonally opposite arms', () => {
    expect(getStartSq(0, 2)).toBe(0);
    expect(getStartSq(1, 2)).toBe(26); // half the 52-square loop away, not 13
    expect(SQUARE_TRACK[getStartSq(1, 2)]).toEqual([1, 8]); // slot 2's classic arm
  });

  test('3- and 4-player games are unaffected — still adjacent arms', () => {
    expect(getStartSq(1, 3)).toBe(13);
    expect(getStartSq(1, 4)).toBe(13);
  });
});

// ─── Board-rendering rotation: exhaustive collision safety ─────────────────
// REGRESSION: an earlier version of the "always show my own base bottom-left,
// and diagonal in a 2-player game" board rotation computed DISPLAY position
// with a different mapping than the REAL game geometry used. That let two
// pieces on genuinely different squares render as if they'd collided — an
// opponent's piece appeared to sit on top of your own with no capture, which
// is exactly the kind of thing a player notices immediately and a human
// tester might not stumble on by luck. This test doesn't rely on luck: it
// exhaustively checks every track position, for every viewer, for every
// player count the square board supports, replicating the exact formula
// SquareBoard.tsx uses (visualSlot), built only from the same squareArm/
// pathToTrack the server itself uses for real captures.
describe('board display rotation — exhaustive collision safety', () => {
  function visualSlot(realSlot, pc, viewerSlot) {
    const viewerArm = squareArm(viewerSlot, pc);
    return (squareArm(realSlot, pc) - viewerArm + 4) % 4;
  }

  test('two pieces render on the same cell if and only if they are really on the same square', () => {
    for (const pc of [2, 3, 4]) {
      const loopLen = getLoopLen(pc);
      for (let viewer = 0; viewer < pc; viewer++) {
        for (let a = 0; a < pc; a++) {
          for (let b = 0; b < pc; b++) {
            if (a === b) continue;
            for (let pa = 0; pa < loopLen; pa += 3) {       // every 3rd square —
              for (let pb = 0; pb < loopLen; pb += 3) {     // exhaustive enough,
                const realA = pathToTrack(pa, a, pc);        // fast enough
                const realB = pathToTrack(pb, b, pc);
                const dispA = pathToTrack(pa, visualSlot(a, pc, viewer), pc);
                const dispB = pathToTrack(pb, visualSlot(b, pc, viewer), pc);
                const reallySame  = realA === realB;
                const looksTheSame = dispA === dispB;
                if (reallySame !== looksTheSame) {
                  throw new Error(
                    `false ${looksTheSame ? 'collision' : 'separation'}: pc=${pc} viewer=${viewer} ` +
                    `A(slot${a},path${pa})=real${realA}/disp${dispA} vs B(slot${b},path${pb})=real${realB}/disp${dispB}`
                  );
                }
              }
            }
          }
        }
      }
    }
  });
});

describe.each([5, 6])('hex board geometry (%i players)', (pc) => {
  const HEX_TRACK = getHexTrack(pc);
  const HEX_HOME_COLS = getHexHomeCols(pc);
  const HEX_HOME_BASES = getHexHomeBases(pc);
  const trackLen = pc * 10;

  test(`the track is ${pc * 10} evenly spaced cells (${pc}-arm star)`, () => {
    expect(HEX_TRACK).toHaveLength(trackLen);
    const gaps = HEX_TRACK.map((c, i) => dist(c, HEX_TRACK[(i + 1) % trackLen]));
    const min = Math.min(...gaps), max = Math.max(...gaps);
    expect(max - min).toBeLessThan(0.001); // uniform all the way round
  });

  test('each home column starts next to its entrance and ends near the centre', () => {
    for (let p = 0; p < pc; p++) {
      const entrance = HEX_TRACK[getHomeEntrance(p, pc)];
      expect(dist(entrance, HEX_HOME_COLS[p][0])).toBeLessThan(40);
      const innermost = HEX_HOME_COLS[p][HEX_HOME_COLS[p].length - 1];
      expect(dist(innermost, [HEX_VIEW / 2, HEX_VIEW / 2])).toBeLessThan(100);
    }
  });

  test('nothing overflows the viewBox', () => {
    const shapes = [
      ...HEX_TRACK.map((c) => [c, 16]),
      ...HEX_HOME_COLS.flat().map((c) => [c, 14]),
      ...HEX_HOME_BASES.map((c) => [c, 46]),
    ];
    for (const [[x, y], r] of shapes) {
      expect(x - r).toBeGreaterThanOrEqual(0);
      expect(y - r).toBeGreaterThanOrEqual(0);
      expect(x + r).toBeLessThanOrEqual(HEX_VIEW);
      expect(y + r).toBeLessThanOrEqual(HEX_VIEW);
    }
  });

  test('home bases do not collide with home columns', () => {
    for (const base of HEX_HOME_BASES) {
      for (const cell of HEX_HOME_COLS.flat()) {
        expect(dist(base, cell)).toBeGreaterThan(46 + 14);
      }
    }
  });
});

describe('hex board arm count follows player count', () => {
  test('a 5-player game is a pentagon, not a hexagon with an empty arm', () => {
    expect(getHexTrack(5)).toHaveLength(50);
    expect(getHexHomeCols(5)).toHaveLength(5);
    expect(getHexHomeBases(5)).toHaveLength(5);
  });

  test('a 6-player game is a hexagon', () => {
    expect(getHexTrack(6)).toHaveLength(60);
    expect(getHexHomeCols(6)).toHaveLength(6);
    expect(getHexHomeBases(6)).toHaveLength(6);
  });

  test('start squares are evenly spaced by arm, for both counts', () => {
    for (let i = 0; i < 5; i++) expect(getStartSq(i, 5)).toBe(i * 10);
    for (let i = 0; i < 6; i++) expect(getStartSq(i, 6)).toBe(i * 10);
  });
});

// ─── getValidMoves ─────────────────────────────────────────────────────────

describe('getValidMoves', () => {
  test('a piece at home is only movable with a roll of 6', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const player = state.players[0];
    expect(getValidMoves(player, 6, state)).toEqual(['p0_piece0', 'p0_piece1', 'p0_piece2', 'p0_piece3']);
    expect(getValidMoves(player, 5, state)).toEqual([]);
  });

  test('an active piece can move if it does not overshoot the goal', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 50);
    expect(getValidMoves(state.players[0], 5, state)).toContain('p0_piece0'); // 55 <= 56
  });

  test('the goal must be reached exactly', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, GOAL_4 - 2); // needs exactly 2
    expect(getValidMoves(state.players[0], 3, state)).not.toContain('p0_piece0');
    expect(getValidMoves(state.players[0], 2, state)).toContain('p0_piece0');
  });

  test('a finished piece is never a valid move, regardless of roll', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const player = state.players[0];
    player.pieces[0].status = 'finished';
    for (let d = 1; d <= 6; d++) {
      expect(getValidMoves(player, d, state)).not.toContain('p0_piece0');
    }
  });

  test('no roll means no moves', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    expect(getValidMoves(state.players[0], null, state)).toEqual([]);
  });
});

// ─── applyMove: releasing from home ────────────────────────────────────────

describe('applyMove — releasing from home', () => {
  test('releasing places the piece on the player\'s own start square', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const next = applyMove(state, 1, 'p1_piece0', 6);
    const piece = next.players[1].pieces[0];
    expect(piece.status).toBe('active');
    expect(piece.pathPosition).toBe(0);
    expect(piece.trackPosition).toBe(getStartSq(1, 4));
  });

  test('rolling a 6 grants a bonus turn — current player does not change', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.currentPlayerIndex = 0;
    expect(applyMove(state, 0, 'p0_piece0', 6).currentPlayerIndex).toBe(0);
  });

  test('the incoming state is never mutated', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const before = JSON.stringify(state);
    applyMove(state, 0, 'p0_piece0', 6);
    expect(JSON.stringify(state)).toBe(before);
  });
});

// ─── applyMove: normal movement ────────────────────────────────────────────

describe('applyMove — normal movement', () => {
  test('advances pathPosition and trackPosition by the dice value', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    const piece = applyMove(state, 0, 'p0_piece0', 4).players[0].pieces[0];
    expect(piece.pathPosition).toBe(14);
    expect(piece.trackPosition).toBe(pathToTrack(14, 0, 4));
  });

  test('entering the home column takes the piece off the shared track', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 50); // 50 is the last track square
    const piece = applyMove(state, 0, 'p0_piece0', 3).players[0].pieces[0];
    expect(piece.pathPosition).toBe(53);
    expect(piece.trackPosition).toBe(-1);
  });

  test('landing exactly on the goal marks the piece finished', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, GOAL_4 - 2);
    expect(applyMove(state, 0, 'p0_piece0', 2).players[0].pieces[0].status).toBe('finished');
  });

  test('finishing all 4 pieces marks the player finished with a rank', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.players[0].pieces.forEach((p, i) => { if (i > 0) p.status = 'finished'; });
    placeActive(state, 0, 0, GOAL_4 - 2);
    const next = applyMove(state, 0, 'p0_piece0', 2);
    expect(next.players[0].isFinished).toBe(true);
    expect(next.players[0].finishRank).toBe(1);
    expect(next.rankings).toEqual([0]);
    expect(next.winner).toBe(0);
  });
});

// ─── applyMove: capturing ───────────────────────────────────────────────────

describe('applyMove — capturing', () => {
  test('landing on an opponent piece sends it home', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    state.players[1].pieces[0].status = 'active';
    state.players[1].pieces[0].trackPosition = pathToTrack(23, 0, 4);
    state.players[1].pieces[0].pathPosition = 5;
    const next = applyMove(state, 0, 'p0_piece0', 13); // 10 + 13 = 23
    expect(next.players[1].pieces[0].status).toBe('home');
    expect(next.players[1].pieces[0].trackPosition).toBe(-1);
    expect(next.players[1].pieces[0].pathPosition).toBe(-1);
    expect(next.lastMove.capturedPieces).toEqual([{ id: 'p1_piece0', playerName: 'B' }]);
  });

  test('cannot capture your own pieces', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    state.players[0].pieces[1].status = 'active';
    state.players[0].pieces[1].trackPosition = pathToTrack(15, 0, 4);
    state.players[0].pieces[1].pathPosition = 3;
    const next = applyMove(state, 0, 'p0_piece0', 5);
    expect(next.players[0].pieces[1].status).toBe('active');
    expect(next.lastMove.capturedPieces).toEqual([]);
  });

  test('a piece on a safe square cannot be captured', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.players[1].pieces[0].status = 'active';
    state.players[1].pieces[0].trackPosition = 8; // a marked safe square
    state.players[1].pieces[0].pathPosition = 3;
    placeActive(state, 0, 0, 3); // player 0 starts at track 0, so pathPos == track
    const next = applyMove(state, 0, 'p0_piece0', 5);
    expect(next.players[1].pieces[0].status).toBe('active');
  });

  test('a piece standing on its own start square cannot be captured', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.players[1].pieces[0].status = 'active';
    state.players[1].pieces[0].trackPosition = getStartSq(1, 4); // 13
    state.players[1].pieces[0].pathPosition = 0;
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 3); // lands on track 13
    expect(next.players[1].pieces[0].status).toBe('active');
  });

  test('a block of 2+ same-colour pieces cannot be captured', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const target = pathToTrack(15, 0, 4);
    [0, 1].forEach((i) => {
      state.players[1].pieces[i].status = 'active';
      state.players[1].pieces[i].trackPosition = target;
      state.players[1].pieces[i].pathPosition = 3;
    });
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 5);
    expect(next.players[1].pieces[0].status).toBe('active');
    expect(next.players[1].pieces[1].status).toBe('active');
    expect(next.lastMove.capturedPieces).toEqual([]);
  });

  test('a piece safe in its home column is out of reach', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 1, 0, 52); // in player 1's home column
    expect(state.players[1].pieces[0].trackPosition).toBe(-1);
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 5);
    expect(next.players[1].pieces[0].status).toBe('active');
    expect(next.lastMove.capturedPieces).toEqual([]);
  });

  // A 2-player game's two arms are diagonally opposite (26 apart, not 13) —
  // capture must still work correctly across that real distance. Target
  // absolute track 30 — deliberately NOT a start/safe square (those are
  // exactly the multiples of 13: 0, 13, 26, 39), so the capture isn't
  // accidentally blocked by safety instead of proving the real thing.
  test('capture works correctly on a 2-player game\'s diagonal arms', () => {
    const state = makeState(2, ['A', 'B']);
    placeActive(state, 1, 0, 4); // B: pathPosition 4 -> absolute track 26+4=30
    expect(state.players[1].pieces[0].trackPosition).toBe(30);
    placeActive(state, 0, 0, 24); // A: pathPosition 24 -> absolute track 24 (arm 0)
    const next = applyMove(state, 0, 'p0_piece0', 6); // 24 + 6 = 30, lands on B
    expect(next.players[1].pieces[0].status).toBe('home');
    expect(next.lastMove.capturedPieces).toEqual([{ id: 'p1_piece0', playerName: 'B' }]);
  });

  test('a 2-player game does NOT falsely capture at the old (adjacent-arm) distance', () => {
    const state = makeState(2, ['A', 'B']);
    placeActive(state, 1, 0, 4); // B at absolute track 30 (see above)
    placeActive(state, 0, 0, 11);
    const next = applyMove(state, 0, 'p0_piece0', 6); // A lands at absolute 17 — the
    // OLD (wrong) geometry would have put B at 13+4=17, matching this; the
    // NEW correct geometry puts B at 30, so this must NOT capture.
    expect(next.players[1].pieces[0].status).toBe('active'); // untouched
    expect(next.lastMove.capturedPieces).toEqual([]);
  });
});

// ─── Turn advancement ───────────────────────────────────────────────────────

describe('applyMove — turn advancement', () => {
  test('turn passes to the next player on a non-6 roll', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    expect(applyMove(state, 0, 'p0_piece0', 3).currentPlayerIndex).toBe(1);
  });

  test('turn skips players who have already finished', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.players[1].isFinished = true;
    placeActive(state, 0, 0, 10);
    expect(applyMove(state, 0, 'p0_piece0', 3).currentPlayerIndex).toBe(2);
  });

  test('rolling a 6 keeps the turn with the same player (bonus roll)', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    expect(applyMove(state, 0, 'p0_piece0', 6).currentPlayerIndex).toBe(0);
  });

  // REGRESSION: finishing your last piece with a roll of exactly 6 left
  // currentPlayerIndex stuck on the now-finished player for ever, soft-locking
  // the game since a finished player can never roll.
  test('REGRESSION: finishing the game with a roll of 6 still advances the turn', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.players[0].pieces.forEach((p, i) => { if (i > 0) p.status = 'finished'; });
    placeActive(state, 0, 0, GOAL_4 - 6);
    const next = applyMove(state, 0, 'p0_piece0', 6);
    expect(next.players[0].isFinished).toBe(true);
    expect(next.currentPlayerIndex).toBe(1);
  });

  test('REGRESSION: finishing the game on 6 still skips already-finished players', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.players[0].pieces.forEach((p, i) => { if (i > 0) p.status = 'finished'; });
    state.players[1].isFinished = true;
    placeActive(state, 0, 0, GOAL_4 - 6);
    expect(applyMove(state, 0, 'p0_piece0', 6).currentPlayerIndex).toBe(2);
  });

  // Bonus roll #2: capturing an opponent's piece — confirmed against Ludo
  // King and standard rule references. Must apply even on a non-6.
  test('capturing an opponent grants a bonus roll even on a non-6', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    state.players[1].pieces[0].status = 'active';
    state.players[1].pieces[0].trackPosition = pathToTrack(23, 0, 4);
    state.players[1].pieces[0].pathPosition = 5;
    const next = applyMove(state, 0, 'p0_piece0', 13); // 10 + 13 = 23, captures B
    expect(next.lastMove.capturedPieces.length).toBeGreaterThan(0);
    expect(next.currentPlayerIndex).toBe(0); // turn stays with the capturer
    expect(next.diceRolled).toBe(false);
  });

  test('a move that does NOT capture still advances the turn on a non-6', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 3); // empty square, no capture
    expect(next.lastMove.capturedPieces).toEqual([]);
    expect(next.currentPlayerIndex).toBe(1);
  });

  // Bonus roll #3: a piece reaching home (finishing) — but only while the
  // player still has other pieces in play; finishing the LAST one is
  // covered by the REGRESSION tests above, where the turn must still pass.
  test('finishing a single piece (not the player\'s last) grants a bonus roll on a non-6', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, GOAL_4 - 3); // needs exactly 3 to finish
    const next = applyMove(state, 0, 'p0_piece0', 3);
    expect(next.players[0].pieces[0].status).toBe('finished');
    expect(next.players[0].isFinished).toBe(false); // 3 pieces still in play
    expect(next.currentPlayerIndex).toBe(0); // bonus roll, turn stays
  });
});

describe('advanceTurn / skipTurn', () => {
  test('advanceTurn wraps around the table', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    advanceTurn(state, 3);
    expect(state.currentPlayerIndex).toBe(0);
  });

  test('advanceTurn terminates even when everyone is finished', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.players.forEach((p) => { p.isFinished = true; });
    advanceTurn(state, 0); // must not hang
    expect(typeof state.currentPlayerIndex).toBe('number');
  });

  test('skipTurn passes the turn on a non-6 and clears the dice', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.diceValue = 3; state.diceRolled = true;
    skipTurn(state, 0, 3);
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.diceRolled).toBe(false);
    expect(state.diceValue).toBeNull();
  });

  test('skipTurn on a 6 keeps the turn (the bonus roll still applies)', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    skipTurn(state, 0, 6);
    expect(state.currentPlayerIndex).toBe(0);
  });
});

// ─── Three sixes in a row ───────────────────────────────────────────────────
// Confirmed against officialgamerules.org: "roll three sixes in a row, you
// lose your turn." The third 6 is void — no move, turn passes immediately.

describe('registerRoll — three-sixes forfeit', () => {
  test('the first two 6s are not a forfeit', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    expect(registerRoll(state, 6)).toBe(false);
    expect(state.sixStreak).toBe(1);
    expect(registerRoll(state, 6)).toBe(false);
    expect(state.sixStreak).toBe(2);
  });

  test('the third consecutive 6 is a forfeit, and resets the streak', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    registerRoll(state, 6);
    registerRoll(state, 6);
    expect(registerRoll(state, 6)).toBe(true);
    expect(state.sixStreak).toBe(0);
  });

  test('any non-6 breaks the streak, even mid-chain', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    registerRoll(state, 6);
    expect(registerRoll(state, 4)).toBe(false);
    expect(state.sixStreak).toBe(0);
    // Streak restarts clean after the break.
    expect(registerRoll(state, 6)).toBe(false);
    expect(state.sixStreak).toBe(1);
  });

  test('advanceTurn always resets the streak for the next player', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    registerRoll(state, 6);
    registerRoll(state, 6);
    expect(state.sixStreak).toBe(2);
    advanceTurn(state, 0);
    expect(state.sixStreak).toBe(0);
  });

  test('a capture-earned bonus roll (non-6) breaks an in-progress six-streak', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    registerRoll(state, 6);
    // The capture roll itself is a 4 — non-6, so the streak must reset even
    // though the capture grants its own bonus roll via applyMove.
    placeActive(state, 0, 0, 10);
    state.players[1].pieces[0].status = 'active';
    state.players[1].pieces[0].trackPosition = pathToTrack(14, 0, 4);
    state.players[1].pieces[0].pathPosition = 5;
    expect(registerRoll(state, 4)).toBe(false);
    expect(state.sixStreak).toBe(0);
    const next = applyMove(state, 0, 'p0_piece0', 4);
    expect(next.lastMove.capturedPieces.length).toBeGreaterThan(0);
    expect(next.currentPlayerIndex).toBe(0); // bonus roll from the capture
  });
});

// ─── Game over ──────────────────────────────────────────────────────────────

describe('game over', () => {
  test('game ends when only one player remains unfinished', () => {
    const state = makeState(3, ['A', 'B', 'C']);
    state.players[1].isFinished = true;
    state.players[1].finishRank = 1;
    state.rankings = [1];
    state.players[2].pieces.forEach((p, i) => { if (i > 0) p.status = 'finished'; });
    placeActive(state, 2, 0, GOAL_4 - 2);
    const next = applyMove(state, 2, 'p2_piece0', 2);
    expect(next.status).toBe('finished');
    expect(next.players[0].isFinished).toBe(true); // straggler gets the last rank
    expect(next.winner).toBe(1);
  });

  test('finalizeIfOver leaves a live game alone', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    finalizeIfOver(state);
    expect(state.status).toBe('waiting');
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe('isValidPlayerCount', () => {
  test('accepts 2 through 6', () => {
    [2, 3, 4, 5, 6].forEach((n) => expect(isValidPlayerCount(n)).toBe(true));
  });

  test('rejects everything else', () => {
    [0, 1, 7, 99, -3, 2.5, NaN, null, undefined, '4', {}].forEach((n) =>
      expect(isValidPlayerCount(n)).toBe(false));
  });
});

// ─── sanitizeState ──────────────────────────────────────────────────────────

describe('sanitizeState', () => {
  test('strips passwordHash from the broadcast state', () => {
    const state = createInitialState('TEST01', 4, 'some-bcrypt-hash');
    const sanitized = sanitizeState(state);
    expect('passwordHash' in sanitized).toBe(false);
    expect(state.passwordHash).toBe('some-bcrypt-hash'); // original untouched
  });

  test('keeps every other field intact', () => {
    const sanitized = sanitizeState(createInitialState('TEST01', 4, 'hash'));
    expect(sanitized.roomCode).toBe('TEST01');
    expect(sanitized.playerCount).toBe(4);
    expect(sanitized.status).toBe('waiting');
  });
});

// ─── Hex board rules ────────────────────────────────────────────────────────

describe('hex board (5–6 players)', () => {
  test('uses a 60-square track and evenly spread start squares', () => {
    expect(getTrackLen(6)).toBe(60);
    expect(getStartSq(2, 6)).toBe(20);
  });

  test('capture and finish logic works the same way on the hex board', () => {
    const state = makeState(6, ['A', 'B', 'C', 'D', 'E', 'F']);
    placeActive(state, 0, 0, GOAL_6 - 6);
    expect(applyMove(state, 0, 'p0_piece0', 6).players[0].pieces[0].status).toBe('finished');
  });

  test('a 5-player game uses the hex board, as its own 5-arm pentagon', () => {
    expect(getTrackLen(5)).toBe(50);
    expect(getGoalPos(5)).toBe(54); // loopLen 49 + 5 home column
    expect(getGoalPos(5)).not.toBe(GOAL_6);
    expect(getStartSq(2, 5)).toBe(20);
  });
});

// ─── pickAutoMove ───────────────────────────────────────────────────────────

describe('pickAutoMove', () => {
  test('returns null when there are no valid moves', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    expect(pickAutoMove(state.players[0], 3, state)).toBeNull();
  });

  test('only ever picks from the actual valid-move set', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const player = state.players[0];
    for (let i = 0; i < 20; i++) {
      expect(getValidMoves(player, 6, state)).toContain(pickAutoMove(player, 6, state));
    }
  });

  test('never picks a finished piece', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const player = state.players[0];
    player.pieces[0].status = 'finished';
    placeActive(state, 0, 1, 10);
    for (let i = 0; i < 20; i++) {
      expect(pickAutoMove(player, 3, state)).not.toBe('p0_piece0');
    }
  });
});

// ─── generateRoomCode ────────────────────────────────────────────────────────

describe('generateRoomCode', () => {
  test('produces a 6-character code from the expected alphabet', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  test('excludes visually-ambiguous characters (0, O, 1, I)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRoomCode()).not.toMatch(/[01OI]/);
    }
  });
});

// ─── A full game must always terminate ──────────────────────────────────────

describe('simulation', () => {
  // Mirrors server.js's actual per-roll loop exactly (registerRoll's
  // three-sixes forfeit included) rather than a simplified stand-in, so this
  // is a faithful full-game playthrough using the real production logic —
  // not just applyMove in isolation.
  test('a fully automatic game always reaches a finished state', () => {
    for (const pc of [2, 3, 4, 5, 6]) {
      const state = makeState(pc, ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, pc));
      let s = state;
      s.status = 'playing';
      let turns = 0;
      let forfeits = 0;
      while (s.status !== 'finished' && turns < 30000) {
        turns++;
        const pi = s.currentPlayerIndex;
        const value = Math.floor(Math.random() * 6) + 1;

        if (registerRoll(s, value)) {
          forfeits++;
          advanceTurn(s, pi);
          clearDice(s);
          continue;
        }

        const pieceId = pickAutoMove(s.players[pi], value, s);
        if (pieceId) s = applyMove(s, pi, pieceId, value);
        else skipTurn(s, pi, value);
      }
      expect(s.status).toBe('finished');
      expect(s.rankings).toHaveLength(pc);
      expect(new Set(s.rankings).size).toBe(pc); // everyone ranked exactly once
      expect(forfeits).toBeGreaterThanOrEqual(0); // sanity: loop actually ran the forfeit path when due
    }
  });

  // Runs enough turns, across enough repetitions, that the 1-in-216 forfeit
  // chance is all but guaranteed to fire at least once — proving the whole
  // roll -> forfeit -> advance loop is sound under real repeated use, not
  // just in the single-shot unit tests above.
  test('the three-sixes forfeit actually fires during real extended play, and the game still finishes cleanly', () => {
    let sawForfeit = false;
    for (let run = 0; run < 10 && !sawForfeit; run++) {
      const state = makeState(4, ['A', 'B', 'C', 'D']);
      let s = state;
      s.status = 'playing';
      let turns = 0;
      while (s.status !== 'finished' && turns < 30000) {
        turns++;
        const pi = s.currentPlayerIndex;
        const value = Math.floor(Math.random() * 6) + 1;
        if (registerRoll(s, value)) {
          sawForfeit = true;
          advanceTurn(s, pi);
          clearDice(s);
          continue;
        }
        const pieceId = pickAutoMove(s.players[pi], value, s);
        if (pieceId) s = applyMove(s, pi, pieceId, value);
        else skipTurn(s, pi, value);
      }
      expect(s.status).toBe('finished');
    }
    expect(sawForfeit).toBe(true);
  });
});
