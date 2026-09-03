const {
  createInitialState, createPlayer, sanitizeState,
  getValidMoves, applyMove, pathToTrack, getStartSq, getTrackLen,
  pickAutoMove, generateRoomCode,
} = require('../game-logic');

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeState(playerCount, names) {
  const state = createInitialState('TEST01', playerCount, null);
  names.forEach((name, i) => {
    state.players.push(createPlayer(state.id, name, i, i));
  });
  return state;
}

// Puts a piece directly onto the main track at a given pathPosition, bypassing
// the home-release step, so tests can set up specific board scenarios.
function placeActive(state, playerIndex, pieceIndex, pathPosition) {
  const piece = state.players[playerIndex].pieces[pieceIndex];
  piece.status = 'active';
  piece.pathPosition = pathPosition;
  piece.trackPosition = pathPosition < getTrackLen(state.playerCount)
    ? pathToTrack(pathPosition, playerIndex, state.playerCount)
    : -1;
  return piece;
}

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
    const player = state.players[0];
    placeActive(state, 0, 0, 50); // 52 (track) + 5 (home col) = 57 is goal; 50+5=55, fits
    expect(getValidMoves(player, 5, state)).toContain('p0_piece0');
  });

  test('an active piece cannot move if the roll would overshoot the goal', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const player = state.players[0];
    placeActive(state, 0, 0, 55); // needs exactly 2 to reach 57 (goal)
    expect(getValidMoves(player, 3, state)).not.toContain('p0_piece0');
    expect(getValidMoves(player, 2, state)).toContain('p0_piece0'); // exact roll is fine
  });

  test('a finished piece is never a valid move, regardless of roll', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const player = state.players[0];
    player.pieces[0].status = 'finished';
    for (let d = 1; d <= 6; d++) {
      expect(getValidMoves(player, d, state)).not.toContain('p0_piece0');
    }
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
    const next = applyMove(state, 0, 'p0_piece0', 6);
    expect(next.currentPlayerIndex).toBe(0);
  });
});

// ─── applyMove: normal movement ────────────────────────────────────────────

describe('applyMove — normal movement', () => {
  test('advances pathPosition and trackPosition by the dice value', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 4);
    const piece = next.players[0].pieces[0];
    expect(piece.pathPosition).toBe(14);
    expect(piece.trackPosition).toBe(pathToTrack(14, 0, 4));
  });

  test('entering the home column sets trackPosition to -1', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 50); // track length is 52; 50+3=53 is inside home column
    const next = applyMove(state, 0, 'p0_piece0', 3);
    const piece = next.players[0].pieces[0];
    expect(piece.pathPosition).toBe(53);
    expect(piece.trackPosition).toBe(-1);
  });

  test('landing exactly on the goal marks the piece finished', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 55); // 55 + 2 = 57 = goal (52 + 5)
    const next = applyMove(state, 0, 'p0_piece0', 2);
    expect(next.players[0].pieces[0].status).toBe('finished');
  });

  test('finishing all 4 pieces marks the player finished with a rank', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.players[0].pieces.forEach((p, i) => { if (i > 0) p.status = 'finished'; });
    placeActive(state, 0, 0, 55);
    const next = applyMove(state, 0, 'p0_piece0', 2);
    expect(next.players[0].isFinished).toBe(true);
    expect(next.players[0].finishRank).toBe(1);
    expect(next.rankings).toEqual([0]);
  });
});

// ─── applyMove: capturing ───────────────────────────────────────────────────

describe('applyMove — capturing', () => {
  test('landing on an opponent piece sends it home', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    placeActive(state, 1, 0, 20); // will collide with player 0 landing at pathPos 23 -> track 23
    // Set player 1's piece to sit exactly at the track square player 0 will land on.
    const targetTrack = pathToTrack(23, 0, 4);
    state.players[1].pieces[0].trackPosition = targetTrack;
    state.players[1].pieces[0].pathPosition = 5; // arbitrary non-home-column value
    const next = applyMove(state, 0, 'p0_piece0', 13); // 10 + 13 = 23
    expect(next.players[1].pieces[0].status).toBe('home');
    expect(next.players[1].pieces[0].trackPosition).toBe(-1);
    expect(next.players[1].pieces[0].pathPosition).toBe(-1);
    expect(next.lastMove.capturedPieces).toEqual([{ id: 'p1_piece0', playerName: 'B' }]);
  });

  test('cannot capture your own pieces', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    placeActive(state, 0, 0, 10);
    const targetTrack = pathToTrack(15, 0, 4);
    state.players[0].pieces[1].status = 'active';
    state.players[0].pieces[1].trackPosition = targetTrack;
    state.players[0].pieces[1].pathPosition = 3;
    const next = applyMove(state, 0, 'p0_piece0', 5); // 10 + 5 = 15
    expect(next.players[0].pieces[1].status).toBe('active'); // still active, not sent home
    expect(next.lastMove.capturedPieces).toEqual([]);
  });

  test('a piece on a safe square cannot be captured', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    // Square-board safe squares include 8. Opponent piece sits there directly.
    state.players[1].pieces[0].status = 'active';
    state.players[1].pieces[0].trackPosition = 8;
    state.players[1].pieces[0].pathPosition = 3; // arbitrary, only trackPosition matters here
    // Player 0 starts at track square 0, so pathPosition N lands on track N directly.
    placeActive(state, 0, 0, 3);
    const next = applyMove(state, 0, 'p0_piece0', 5); // 3 + 5 = 8 -> lands on safe square 8
    expect(next.players[1].pieces[0].status).toBe('active'); // not captured
  });

  test('a block of 2+ same-color pieces cannot be captured', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const targetTrack = pathToTrack(15, 0, 4);
    state.players[1].pieces[0].status = 'active';
    state.players[1].pieces[0].trackPosition = targetTrack;
    state.players[1].pieces[0].pathPosition = 3;
    state.players[1].pieces[1].status = 'active';
    state.players[1].pieces[1].trackPosition = targetTrack;
    state.players[1].pieces[1].pathPosition = 3;
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 5); // 10 + 5 = 15
    expect(next.players[1].pieces[0].status).toBe('active');
    expect(next.players[1].pieces[1].status).toBe('active');
    expect(next.lastMove.capturedPieces).toEqual([]);
  });
});

// ─── applyMove: turn advancement (regression test for the turn-freeze bug) ──

describe('applyMove — turn advancement', () => {
  test('turn passes to the next player on a non-6 roll', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.currentPlayerIndex = 0;
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 3);
    expect(next.currentPlayerIndex).toBe(1);
  });

  test('turn skips players who have already finished', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.currentPlayerIndex = 0;
    state.players[1].isFinished = true;
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 3);
    expect(next.currentPlayerIndex).toBe(2);
  });

  test('rolling a 6 keeps the turn with the same player (bonus roll)', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.currentPlayerIndex = 0;
    placeActive(state, 0, 0, 10);
    const next = applyMove(state, 0, 'p0_piece0', 6);
    expect(next.currentPlayerIndex).toBe(0);
  });

  // Regression test: previously, finishing your last piece with a roll of
  // exactly 6 left currentPlayerIndex stuck on the now-finished player
  // forever, soft-locking the game since a finished player can never roll.
  test('REGRESSION: finishing the game with a roll of 6 still advances the turn', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.currentPlayerIndex = 0;
    state.players[0].pieces.forEach((p, i) => { if (i > 0) p.status = 'finished'; });
    placeActive(state, 0, 0, 51); // 51 + 6 = 57 = goal
    const next = applyMove(state, 0, 'p0_piece0', 6);
    expect(next.players[0].isFinished).toBe(true);
    expect(next.currentPlayerIndex).not.toBe(0);
    expect(next.currentPlayerIndex).toBe(1);
  });

  test('REGRESSION: finishing the game on 6 still skips already-finished players', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    state.currentPlayerIndex = 0;
    state.players[0].pieces.forEach((p, i) => { if (i > 0) p.status = 'finished'; });
    state.players[1].isFinished = true;
    placeActive(state, 0, 0, 51);
    const next = applyMove(state, 0, 'p0_piece0', 6);
    expect(next.currentPlayerIndex).toBe(2);
  });
});

// ─── applyMove: game-over conditions ────────────────────────────────────────

describe('applyMove — game over', () => {
  test('game ends when only one player remains unfinished', () => {
    const state = makeState(3, ['A', 'B', 'C']);
    state.players[1].isFinished = true;
    state.players[1].finishRank = 1;
    state.rankings = [1];
    // Player 2 finishes now, leaving only player 0 active -> game auto-ends for player 0 too.
    state.players[2].pieces.forEach((p, i) => { if (i > 0) p.status = 'finished'; });
    placeActive(state, 2, 0, 55); // track length for 3 players is the square board (52)
    const next = applyMove(state, 2, 'p2_piece0', 2); // reaches goal exactly
    expect(next.status).toBe('finished');
    expect(next.players[0].isFinished).toBe(true); // last remaining player auto-finished
  });
});

// ─── sanitizeState ──────────────────────────────────────────────────────────

describe('sanitizeState', () => {
  test('strips passwordHash from the broadcast state', () => {
    const state = createInitialState('TEST01', 4, 'some-bcrypt-hash');
    const sanitized = sanitizeState(state);
    expect(sanitized.passwordHash).toBeUndefined();
    expect('passwordHash' in sanitized).toBe(false);
    // Original state object is untouched.
    expect(state.passwordHash).toBe('some-bcrypt-hash');
  });

  test('keeps every other field intact', () => {
    const state = createInitialState('TEST01', 4, 'hash');
    const sanitized = sanitizeState(state);
    expect(sanitized.roomCode).toBe('TEST01');
    expect(sanitized.playerCount).toBe(4);
    expect(sanitized.status).toBe('waiting');
  });
});

// ─── Hex board (5-6 players) sanity checks ──────────────────────────────────

describe('hex board (5-6 players)', () => {
  test('uses a 60-square track and different start squares than the square board', () => {
    const state = makeState(6, ['A', 'B', 'C', 'D', 'E', 'F']);
    expect(getTrackLen(6)).toBe(60);
    expect(getStartSq(2, 6)).toBe(20);
  });

  test('capture and finish logic works the same way on the hex board', () => {
    const state = makeState(6, ['A', 'B', 'C', 'D', 'E', 'F']);
    placeActive(state, 0, 0, 58); // 60 (track) + 5 (home col) = 65 is goal; 58+7=65
    const next = applyMove(state, 0, 'p0_piece0', 7);
    expect(next.players[0].pieces[0].status).toBe('finished');
  });
});

// ─── pickAutoMove (AUTO-mode piece selection) ───────────────────────────────

describe('pickAutoMove', () => {
  test('returns null when there are no valid moves', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    expect(pickAutoMove(state.players[0], 3, state)).toBeNull(); // all pieces home, rolled non-6
  });

  test('only ever picks from the actual valid-move set', () => {
    const state = makeState(4, ['A', 'B', 'C', 'D']);
    const player = state.players[0];
    for (let i = 0; i < 20; i++) {
      const pick = pickAutoMove(player, 6, state);
      expect(getValidMoves(player, 6, state)).toContain(pick);
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
