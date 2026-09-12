// Presentation-only constants. Anything that is a *rule* (path lengths, safe
// squares, start squares, board geometry) lives in ./rules.js, which the
// server shares — see ./board.ts for the typed view of it.

// ─── Player Colors ───────────────────────────────────────────────────────────
export interface PlayerColor {
  name: string;
  hex: string;
  glow: string;
  home: string;
  homeColumn: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { name: 'Neon Pink',     hex: '#ff2d78', glow: 'rgba(255,45,120,0.6)', home: '#ff2d7820', homeColumn: '#ff2d7840' },
  { name: 'Electric Blue', hex: '#00c8ff', glow: 'rgba(0,200,255,0.6)',  home: '#00c8ff20', homeColumn: '#00c8ff40' },
  { name: 'Acid Green',    hex: '#39ff14', glow: 'rgba(57,255,20,0.6)',  home: '#39ff1420', homeColumn: '#39ff1440' },
  { name: 'Hot Orange',    hex: '#ff6b00', glow: 'rgba(255,107,0,0.6)',  home: '#ff6b0020', homeColumn: '#ff6b0040' },
  { name: 'Neon Purple',   hex: '#bf00ff', glow: 'rgba(191,0,255,0.6)',  home: '#bf00ff20', homeColumn: '#bf00ff40' },
  { name: 'Neon Yellow',   hex: '#ffe600', glow: 'rgba(255,230,0,0.6)',  home: '#ffe60020', homeColumn: '#ffe60040' },
];

/** Colour for a slot that nobody has taken yet. */
export const EMPTY_SLOT_COLOR = 'rgba(255,255,255,0.16)';

// ─── Ping thresholds (ms) ────────────────────────────────────────────────────
export const PING_GOOD = 100;
export const PING_FAIR = 300;

// ─── Client-side UI timings (ms) ─────────────────────────────────────────────
/** Minimum time the dice tumbles, so the roll reads as an actual roll, not a flicker. */
export const DICE_ROLL_MIN_MS = 3_000;
/** How long a roll request may hang before the button unsticks itself. */
export const ROLL_TIMEOUT_MS  = 6_000;
export const TOAST_MS         = 3_200;
/** One square of a piece's box-by-box walk (see getWalkSteps). */
export const WALK_STEP_MS     = 150;
/** A walk never takes longer than this in total — a captured piece sent home
 *  from far across the board speeds up its per-square pace instead of
 *  crawling for many seconds. */
export const WALK_MAX_MS      = 2_500;

// ─── Storage keys ────────────────────────────────────────────────────────────
export const STORAGE_CREATE = 'ludo_create';
export const STORAGE_TEST   = 'ludo_test';
export const STORAGE_ROOM   = (code: string) => `ludo_room_${code}`;
export const STORAGE_MUTED  = 'ludo_muted';
export const STORAGE_NAME   = 'ludo_name';
