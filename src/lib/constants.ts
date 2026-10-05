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

// Chosen by measured perceptual distance (OKLab, plus a deuteranopia
// simulation), not by eye — see tests/palette.test.js, which fails if any two
// drift too close. Yellow was replaced (it was near-identical to Acid Green
// for colour-blind players) and Pink shifted off Orange, previously the
// closest pair of all.
export const PLAYER_COLORS: PlayerColor[] = [
  { name: 'Neon Pink',     hex: '#ff2d9b', glow: 'rgba(255,45,155,0.6)',  home: '#ff2d9b20', homeColumn: '#ff2d9b40' },
  { name: 'Electric Blue', hex: '#00c8ff', glow: 'rgba(0,200,255,0.6)',   home: '#00c8ff20', homeColumn: '#00c8ff40' },
  { name: 'Acid Green',    hex: '#39ff14', glow: 'rgba(57,255,20,0.6)',   home: '#39ff1420', homeColumn: '#39ff1440' },
  { name: 'Hot Orange',    hex: '#ff6b00', glow: 'rgba(255,107,0,0.6)',   home: '#ff6b0020', homeColumn: '#ff6b0040' },
  { name: 'Neon Purple',   hex: '#bf00ff', glow: 'rgba(191,0,255,0.6)',   home: '#bf00ff20', homeColumn: '#bf00ff40' },
  { name: 'Ice White',     hex: '#f2f2f7', glow: 'rgba(242,242,247,0.6)', home: '#f2f2f720', homeColumn: '#f2f2f740' },
];

export const TEAM_NAMES = ['Team A', 'Team B'] as const;

/** True for a near-white colour — a white outline vanishes against it, so
 *  pieces of that colour get a dark one instead. */
export function isLightColor(hex: string): boolean {
  const n = parseInt(hex.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.85;
}

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
export const STORAGE_ROOM   = (code: string) => `ludo_room_${code}`;
export const STORAGE_MUTED  = 'ludo_muted';
export const STORAGE_NAME   = 'ludo_name';
