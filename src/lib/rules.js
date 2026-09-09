/**
 * Pure Ludo rules + board geometry — the single source of truth shared by
 * server.js (authoritative engine), game-logic.js (state transitions) and the
 * React board components.
 *
 * CommonJS on purpose: server.js is plain Node and cannot import TypeScript.
 * Zero dependencies, zero I/O — everything here is a constant or a pure
 * function, which is also what makes the geometry unit-testable.
 *
 * ── The path model ──────────────────────────────────────────────────────────
 * A piece's position is a single number, `pathPosition`, measured from that
 * player's own start square:
 *
 *   -1                     in the home base, not yet released
 *   0 .. loopLen-1         on the shared outer track
 *   loopLen .. goal-1      in that player's private home column
 *   goal                   finished, in the centre
 *
 * `loopLen` is trackLen - 1, NOT trackLen. A piece enters at its start square
 * and turns into its home column at the square *before* it — so it visits 51
 * of the 52 track squares (59 of 60 on hex). The one square it never lands on
 * is the first square of its own arm, which other players still pass through.
 */

// ─── Core rule constants ─────────────────────────────────────────────────────
const PIECES_PER_PLAYER = 4;
const HOME_COLUMN_LEN   = 5;
const MIN_PLAYERS       = 2;
const MAX_PLAYERS       = 6;

const SQUARE_TRACK_LEN = 52;   // 2–4 players, classic 15×15 board
const HEX_CELLS_PER_ARM = 10;  // 5–6 players: each arm contributes 10 track cells

const SQUARE_START = { 0: 0, 1: 13, 2: 26, 3: 39 };

// Safe squares = every start square, plus the "star" square 8 steps past each
// start. A piece standing on one can never be captured.
const SQUARE_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// ─── Board selection ─────────────────────────────────────────────────────────

/** @param {number} pc playerCount */
function isSquareBoard(pc) { return pc <= 4; }

/**
 * A hex-board game has exactly as many arms as players — a 5-player game is
 * a true pentagon, a 6-player game a true hexagon, not a hexagon with one
 * arm left empty. @param {number} pc
 */
function getHexArms(pc) { return pc; }

/** Number of squares on the shared outer track. @param {number} pc */
function getTrackLen(pc) { return isSquareBoard(pc) ? SQUARE_TRACK_LEN : getHexArms(pc) * HEX_CELLS_PER_ARM; }

/**
 * How many track squares a single piece walks before turning into its home
 * column. One less than the track length — see the path model above.
 * @param {number} pc
 */
function getLoopLen(pc) { return getTrackLen(pc) - 1; }

/** The pathPosition that means "finished". @param {number} pc */
function getGoalPos(pc) { return getLoopLen(pc) + HOME_COLUMN_LEN; }

/** @param {number} pc */
function getHexSafeSet(pc) {
  const safe = new Set();
  for (let arm = 0; arm < getHexArms(pc); arm++) {
    safe.add(arm * HEX_CELLS_PER_ARM);
    safe.add(arm * HEX_CELLS_PER_ARM + 8);
  }
  return safe;
}

/** @param {number} pc */
function getSafeSet(pc) { return isSquareBoard(pc) ? SQUARE_SAFE : getHexSafeSet(pc); }

/**
 * Which of the 4 square-board arms a slot actually starts on. Identity for
 * everything except a 2-player game: there, the two players sit on the
 * DIAGONAL arms (0 and 2), not two adjacent ones — the classic 2-player
 * Ludo layout, opponents across the board rather than side by side.
 *
 * This is real geometry, not a rendering trick: it changes actual capture
 * distance and safe-square proximity for 2-player games. It has to be —
 * anything that instead just draws the pieces in different corners while
 * their true positions stay 13 apart (adjacent) can make two pieces that
 * are NOT on the same square appear to visually collide, which is worse
 * than not having the feature at all.
 * @param {number} slotIndex @param {number} pc
 */
function squareArm(slotIndex, pc) {
  return pc === 2 ? (slotIndex === 0 ? 0 : 2) : slotIndex;
}

/** @param {number} idx slotIndex @param {number} pc */
function getStartSq(idx, pc) { return isSquareBoard(pc) ? SQUARE_START[squareArm(idx, pc)] : idx * HEX_CELLS_PER_ARM; }

/** True while the piece is still on the shared track (and so capturable). */
function isOnTrack(pathPosition, pc) {
  return pathPosition >= 0 && pathPosition < getLoopLen(pc);
}

/** Map a player-relative pathPosition to an absolute square on the shared track. */
function pathToTrack(pathPosition, playerIndex, pc) {
  return (getStartSq(playerIndex, pc) + pathPosition) % getTrackLen(pc);
}

/** The last track square a player stands on before turning into their home column. */
function getHomeEntrance(playerIndex, pc) {
  return pathToTrack(getLoopLen(pc) - 1, playerIndex, pc);
}

/** Rooms are only playable at these sizes; anything else is a malformed request. */
function isValidPlayerCount(pc) {
  return Number.isInteger(pc) && pc >= MIN_PLAYERS && pc <= MAX_PLAYERS;
}

// ─── Move legality ───────────────────────────────────────────────────────────

/**
 * Every piece the player is allowed to move with this roll.
 * A piece in the home base needs a 6; a piece on the board needs a roll that
 * does not overshoot the goal (the goal must be hit exactly).
 *
 * @param {{pieces: Array<{id:string,status:string,pathPosition:number}>}} player
 * @param {number} diceValue
 * @param {{playerCount:number}} state
 * @returns {string[]} piece ids
 */
function getValidMoves(player, diceValue, state) {
  if (!player || !diceValue) return [];
  const goal = getGoalPos(state.playerCount);

  return player.pieces
    .filter((piece) => {
      if (piece.status === 'finished') return false;
      if (piece.status === 'home')     return diceValue === 6;
      return piece.pathPosition + diceValue <= goal;
    })
    .map((p) => p.id);
}

// ─── Square board geometry (2–4 players) ─────────────────────────────────────
// A 15×15 grid. Coordinates below are [row, col], 0-indexed.

const SQUARE_GRID = 15;
const SQUARE_CELL = 40;                        // SVG units per cell
const SQUARE_SIZE = SQUARE_GRID * SQUARE_CELL; // 600×600 viewBox

/**
 * The 52 track squares, clockwise, starting at player 0's start square.
 * Each of the four arms contributes 13 squares: 6 outbound, 1 corner,
 * 6 inbound.
 */
const SQUARE_TRACK = [
  // ── Bottom arm, going up col 6 (player 0 enters here, at [13,6]) ──
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  // ── Left arm ──
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  // ── Top arm ──
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6],
  [0, 6],
  [0, 7],
  [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  // ── Right arm ──
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13],
  [6, 14],
  [7, 14],
  [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  // ── Back down to the bottom arm ──
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8],
  [14, 8],
  [14, 7],
  [14, 6],
];

/** Each player's 5-square private run to the centre, ordered outermost first. */
const SQUARE_HOME_COLS = [
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], // 0 — up   from the bottom
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],     // 1 — right from the left
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],     // 2 — down  from the top
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], // 3 — left  from the right
];

/** Top-left [row, col] of each player's 6×6 home-base quadrant. */
const SQUARE_HOME_QUADRANTS = [
  [9, 0], // 0 — bottom-left
  [0, 0], // 1 — top-left
  [0, 9], // 2 — top-right
  [9, 9], // 3 — bottom-right
];

// ─── Hex board geometry (5–6 players) ────────────────────────────────────────
// A 6-arm star: a hexagonal track ring, six home columns running from the
// track in to the centre goal, and six home bases tucked into the wedges
// between adjacent columns.

const HEX_VIEW  = 720;
const HEX_CX    = HEX_VIEW / 2;
const HEX_CY    = HEX_VIEW / 2;
const HEX_R_TRACK     = 292;  // distance from centre to a hexagon corner
const HEX_R_COL_OUTER = 236;  // first (outermost) home-column cell
const HEX_R_COL_INNER = 84;   // last home-column cell, just outside the goal
const HEX_R_BASE      = 172;  // distance from centre to a home-base centre
const HEX_R_GOAL      = 48;

/**
 * Corner k of the board polygon; corner 0 is straight up. `arms` is the
 * player count — this is what turns a 5-player board into a true pentagon
 * and a 6-player board into a true hexagon, instead of always drawing six
 * corners and leaving one arm empty.
 * @param {number} k @param {number} arms
 */
function hexCorner(k, arms) {
  const a = (k % arms) * ((2 * Math.PI) / arms) - Math.PI / 2;
  return [HEX_CX + HEX_R_TRACK * Math.cos(a), HEX_CY + HEX_R_TRACK * Math.sin(a)];
}

/** The track cells, walked clockwise around the polygon perimeter. @param {number} pc */
function getHexTrack(pc) {
  const arms = getHexArms(pc);
  return Array.from({ length: arms * HEX_CELLS_PER_ARM }, (_, i) => {
    const edge = Math.floor(i / HEX_CELLS_PER_ARM);
    const t    = (i % HEX_CELLS_PER_ARM) / HEX_CELLS_PER_ARM;
    const [x0, y0] = hexCorner(edge, arms);
    const [x1, y1] = hexCorner(edge + 1, arms);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  });
}

/** Angle from the centre to a player's home-column entrance square. @param {number} playerIndex @param {number} pc */
function hexArmAngle(playerIndex, pc) {
  const [ex, ey] = getHexTrack(pc)[getHomeEntrance(playerIndex, pc)];
  return Math.atan2(ey - HEX_CY, ex - HEX_CX);
}

/**
 * A player's home column, running inward from just under their entrance
 * square to the edge of the goal — so it visibly connects the two.
 * @param {number} playerIndex @param {number} pc
 */
function hexHomeColumn(playerIndex, pc) {
  const a    = hexArmAngle(playerIndex, pc);
  const step = (HEX_R_COL_OUTER - HEX_R_COL_INNER) / (HOME_COLUMN_LEN - 1);
  return Array.from({ length: HOME_COLUMN_LEN }, (_, i) => {
    const r = HEX_R_COL_OUTER - i * step;
    return [HEX_CX + r * Math.cos(a), HEX_CY + r * Math.sin(a)];
  });
}

/**
 * Home base centre, offset half an arm's angle from the home column — onto
 * the bisector between this arm and the next — so bases sit in the empty
 * wedges instead of colliding with the columns.
 * @param {number} playerIndex @param {number} pc
 */
function hexHomeBase(playerIndex, pc) {
  const a = hexArmAngle(playerIndex, pc) + Math.PI / getHexArms(pc);
  return [HEX_CX + HEX_R_BASE * Math.cos(a), HEX_CY + HEX_R_BASE * Math.sin(a)];
}

/** @param {number} pc */
function getHexHomeCols(pc) {
  return Array.from({ length: getHexArms(pc) }, (_, i) => hexHomeColumn(i, pc));
}

/** @param {number} pc */
function getHexHomeBases(pc) {
  return Array.from({ length: getHexArms(pc) }, (_, i) => hexHomeBase(i, pc));
}

module.exports = {
  // rules
  PIECES_PER_PLAYER, HOME_COLUMN_LEN, MIN_PLAYERS, MAX_PLAYERS,
  SQUARE_TRACK_LEN, HEX_CELLS_PER_ARM,
  SQUARE_START, SQUARE_SAFE,
  isSquareBoard, getHexArms, getTrackLen, getLoopLen, getGoalPos, getSafeSet, getStartSq,
  isOnTrack, pathToTrack, getHomeEntrance, isValidPlayerCount, getValidMoves, squareArm,
  // square geometry
  SQUARE_GRID, SQUARE_CELL, SQUARE_SIZE,
  SQUARE_TRACK, SQUARE_HOME_COLS, SQUARE_HOME_QUADRANTS,
  // hex geometry
  HEX_VIEW, HEX_CX, HEX_CY, HEX_R_TRACK, HEX_R_GOAL,
  getHexTrack, getHexHomeCols, getHexHomeBases, hexCorner,
};
