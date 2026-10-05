/**
 * 2v2 team rules — pure game-logic, no server. Seats follow arrangeTeamSeats:
 * slots 0+2 are Team A (team 0), slots 1+3 are Team B (team 1), so partners
 * sit opposite and turns alternate between the teams.
 *
 * Square board starts: slot 0 → 0, 1 → 13, 2 → 26, 3 → 39. Track square 30 is
 * not a safe square, so it's used as the contested square throughout.
 */
const {
  createInitialState, createPlayer, applyMove, finalizeIfOver, advanceTurn,
  pickTeamForNewPlayer, arrangeTeamSeats, getGoalPos, pathToTrack, isOnTrack,
} = require('../game-logic');
const { wouldCaptureAt, capturesAt } = require('../src/lib/rules');

const GOAL = getGoalPos(4);
const CONTESTED = 30;

function makeTeamState({ teamMode = true } = {}) {
  const state = createInitialState('TEAM01', 4, null, teamMode);
  ['A1', 'B1', 'A2', 'B2'].forEach((name, i) => {
    const p = createPlayer(state.id, name, i, i);
    if (teamMode) p.team = i % 2;
    state.players.push(p);
  });
  state.status = 'playing';
  return state;
}

/** Path position that puts `slot`'s piece on absolute track square `track`. */
const pathFor = (slot, track) => (track - pathToTrack(0, slot, 4) + 52) % 52;

function place(state, slot, pieceIndex, pathPosition) {
  const piece = state.players[slot].pieces[pieceIndex];
  piece.status = 'active';
  piece.pathPosition = pathPosition;
  piece.trackPosition = isOnTrack(pathPosition, 4) ? pathToTrack(pathPosition, slot, 4) : -1;
  return piece;
}

function finishAll(state, slot) {
  const p = state.players[slot];
  for (const piece of p.pieces) {
    piece.status = 'finished';
    piece.pathPosition = GOAL;
    piece.trackPosition = -1;
  }
  p.isFinished = true;
  p.finishRank = state.rankings.length + 1;
  state.rankings.push(slot);
}

/** Move slot's piece 0 from 3 squares short of CONTESTED onto it. */
function moveOntoContested(state, slot) {
  place(state, slot, 0, pathFor(slot, CONTESTED) - 3);
  state.currentPlayerIndex = slot;
  state.diceRolled = true;
  state.diceValue = 3;
  return applyMove(state, slot, `p${slot}_piece0`, 3);
}

describe('team captures', () => {
  test('a piece never captures its partner', () => {
    const s = makeTeamState();
    place(s, 2, 0, pathFor(2, CONTESTED));
    const next = moveOntoContested(s, 0);
    expect(next.lastMove.capturedPieces).toEqual([]);
    expect(next.players[2].pieces[0]).toMatchObject({ status: 'active', trackPosition: CONTESTED });
  });

  test('a lone opponent piece is still captured', () => {
    const s = makeTeamState();
    place(s, 1, 0, pathFor(1, CONTESTED));
    const next = moveOntoContested(s, 0);
    expect(next.lastMove.capturedPieces.map((c) => c.id)).toEqual(['p1_piece0']);
    expect(next.players[1].pieces[0].status).toBe('home');
  });

  test('two partners on one square form a block the other team cannot capture', () => {
    const s = makeTeamState();
    place(s, 1, 0, pathFor(1, CONTESTED));
    place(s, 3, 0, pathFor(3, CONTESTED));
    const next = moveOntoContested(s, 0);
    expect(next.lastMove.capturedPieces).toEqual([]);
    expect(next.players[1].pieces[0].status).toBe('active');
    expect(next.players[3].pieces[0].status).toBe('active');
  });

  test('without teams, two different opponents on a square are each captured', () => {
    const s = makeTeamState({ teamMode: false });
    place(s, 1, 0, pathFor(1, CONTESTED));
    place(s, 3, 0, pathFor(3, CONTESTED));
    const next = moveOntoContested(s, 0);
    expect(next.lastMove.capturedPieces.map((c) => c.id).sort()).toEqual(['p1_piece0', 'p3_piece0']);
  });

  test('the board preview agrees with the real capture in every case', () => {
    const partner = makeTeamState();
    place(partner, 2, 0, pathFor(2, CONTESTED));
    expect(wouldCaptureAt(CONTESTED, 0, partner.players, 4)).toBe(false);

    const lone = makeTeamState();
    place(lone, 1, 0, pathFor(1, CONTESTED));
    expect(wouldCaptureAt(CONTESTED, 0, lone.players, 4)).toBe(true);

    const block = makeTeamState();
    place(block, 1, 0, pathFor(1, CONTESTED));
    place(block, 3, 0, pathFor(3, CONTESTED));
    expect(wouldCaptureAt(CONTESTED, 0, block.players, 4)).toBe(false);
    expect(capturesAt(CONTESTED, 0, block.players, 4)).toEqual([]);
  });

  test('safe squares protect a lone opponent in team games too', () => {
    const s = makeTeamState();
    place(s, 1, 0, pathFor(1, 34)); // 34 is a star square
    expect(wouldCaptureAt(34, 0, s.players, 4)).toBe(false);
  });
});

describe('team win', () => {
  test('one partner finishing does not end the game, and their turns are skipped', () => {
    const s = makeTeamState();
    place(s, 0, 0, GOAL - 2);
    for (let i = 1; i < 4; i++) {
      const pc = s.players[0].pieces[i];
      pc.status = 'finished'; pc.pathPosition = GOAL; pc.trackPosition = -1;
    }
    s.currentPlayerIndex = 0;
    const next = applyMove(s, 0, 'p0_piece0', 2);
    expect(next.players[0].isFinished).toBe(true);
    expect(next.status).toBe('playing');
    expect(next.winner).toBeNull();          // not a win on its own
    advanceTurn(next, 3);
    expect(next.currentPlayerIndex).toBe(1); // skips the finished slot 0
  });

  test('the team wins together when the second partner gets home', () => {
    const s = makeTeamState();
    finishAll(s, 0);
    place(s, 2, 0, GOAL - 2);
    for (let i = 1; i < 4; i++) {
      const pc = s.players[2].pieces[i];
      pc.status = 'finished'; pc.pathPosition = GOAL; pc.trackPosition = -1;
    }
    s.currentPlayerIndex = 2;
    const next = applyMove(s, 2, 'p2_piece0', 2);

    expect(next.status).toBe('finished');
    expect(next.winningTeam).toBe(0);
    expect(next.rankings.slice(0, 2)).toEqual([0, 2]); // winners first, in finish order
    expect(next.rankings.slice(2).sort()).toEqual([1, 3]);
    expect(next.players.map((p) => p.finishRank)).toEqual([1, 2, 1, 2]);
    expect(next.winner).toBe(0);
  });

  test('Team B can win too', () => {
    const s = makeTeamState();
    finishAll(s, 3);
    finishAll(s, 1);
    finalizeIfOver(s);
    expect(s.status).toBe('finished');
    expect(s.winningTeam).toBe(1);
    expect(s.players.map((p) => p.finishRank)).toEqual([2, 1, 2, 1]);
  });

  test('with a partner removed, the other partner finishing wins for the team', () => {
    const s = makeTeamState();
    s.players[2].isFinished = true;
    s.kickedOrder = [2];
    finalizeIfOver(s);
    expect(s.status).toBe('playing'); // slot 0 still has pieces out

    finishAll(s, 0);
    finalizeIfOver(s);
    expect(s.status).toBe('finished');
    expect(s.winningTeam).toBe(0);
    expect(s.kickedOrder).toEqual([2]); // kept, so the end screen can say who was removed
  });

  test('if the whole other team is removed, the remaining team wins', () => {
    const s = makeTeamState();
    s.players[1].isFinished = true;
    s.players[3].isFinished = true;
    s.kickedOrder = [1, 3];
    finalizeIfOver(s);
    expect(s.status).toBe('finished');
    expect(s.winningTeam).toBe(0);
    expect(s.players[0].finishRank).toBe(1);
    expect(s.players[1].finishRank).toBe(2);
  });

  test('one member of each team removed: the game carries on', () => {
    const s = makeTeamState();
    s.players[2].isFinished = true;
    s.players[3].isFinished = true;
    s.kickedOrder = [2, 3];
    finalizeIfOver(s);
    expect(s.status).toBe('playing');
  });

  test('non-team games are untouched: first finisher still wins outright', () => {
    const s = makeTeamState({ teamMode: false });
    place(s, 0, 0, GOAL - 2);
    for (let i = 1; i < 4; i++) {
      const pc = s.players[0].pieces[i];
      pc.status = 'finished'; pc.pathPosition = GOAL; pc.trackPosition = -1;
    }
    const next = applyMove(s, 0, 'p0_piece0', 2);
    expect(next.winner).toBe(0);
    expect(next.winningTeam).toBeNull();
  });
});

describe('team seating', () => {
  test('new players fill the shorter team, so a full room is always 2 v 2', () => {
    const s = createInitialState('T', 4, null, true);
    const join = (name) => {
      const p = createPlayer(s.id, name, s.players.length, s.players.length);
      p.team = pickTeamForNewPlayer(s);
      s.players.push(p);
      return p.team;
    };
    expect([join('H'), join('a'), join('b'), join('c')]).toEqual([0, 1, 0, 1]);
  });

  test('partners end up opposite and the host keeps slot 0', () => {
    const s = createInitialState('T', 4, null, true);
    // Join order: host + a friend on Team A, then two on Team B.
    [['H', 0], ['X', 0], ['Y', 1], ['Z', 1]].forEach(([name, team], i) => {
      const p = createPlayer(s.id, name, i, i);
      p.team = team;
      s.players.push(p);
    });
    arrangeTeamSeats(s);
    expect(s.players.map((p) => p.name)).toEqual(['H', 'Y', 'X', 'Z']);
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
  });

  test('a host on Team B still keeps slot 0', () => {
    const s = createInitialState('T', 4, null, true);
    [['X', 0], ['H', 1], ['Y', 0], ['Z', 1]].forEach(([name, team], i) => {
      const p = createPlayer(s.id, name, i, i);
      p.team = team;
      p.isHost = name === 'H';
      s.players.push(p);
    });
    arrangeTeamSeats(s);
    expect(s.players[0].name).toBe('H');
    expect(s.players.map((p) => p.team)).toEqual([1, 0, 1, 0]);
  });
});
