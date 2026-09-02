// ─── Player Colors ───────────────────────────────────────────────────────────
export const PLAYER_COLORS = [
  { name: 'Neon Pink',     hex: '#ff2d78', glow: 'rgba(255,45,120,0.6)',   home: '#ff2d7820', homeColumn: '#ff2d7840' },
  { name: 'Electric Blue', hex: '#00c8ff', glow: 'rgba(0,200,255,0.6)',    home: '#00c8ff20', homeColumn: '#00c8ff40' },
  { name: 'Acid Green',    hex: '#39ff14', glow: 'rgba(57,255,20,0.6)',    home: '#39ff1420', homeColumn: '#39ff1440' },
  { name: 'Hot Orange',    hex: '#ff6b00', glow: 'rgba(255,107,0,0.6)',    home: '#ff6b0020', homeColumn: '#ff6b0040' },
  { name: 'Neon Purple',   hex: '#bf00ff', glow: 'rgba(191,0,255,0.6)',    home: '#bf00ff20', homeColumn: '#bf00ff40' },
  { name: 'Neon Yellow',   hex: '#ffe600', glow: 'rgba(255,230,0,0.6)',    home: '#ffe60020', homeColumn: '#ffe60040' },
];

// ─── Board Constants ──────────────────────────────────────────────────────────
export const PIECES_PER_PLAYER = 4;
export const MAIN_TRACK_LENGTH = 52;      // squares around the outer track
export const HOME_COLUMN_LENGTH = 5;      // squares in colored home stretch
export const TOTAL_PATH_LENGTH = MAIN_TRACK_LENGTH + HOME_COLUMN_LENGTH + 1; // +1 for goal

// ─── Reconnect / AUTO Timeout ─────────────────────────────────────────────────
export const RECONNECT_GRACE_MS = 30_000;  // 30 seconds before AUTO kicks in
export const AUTO_MOVE_DELAY_MS = 2_000;   // AUTO waits 2s before moving (feels natural)
export const TURN_TIMEOUT_MS = 30_000;     // 30s per turn before AUTO takes over

// ─── Ping Thresholds (ms) ────────────────────────────────────────────────────
export const PING_GOOD      = 100;
export const PING_FAIR      = 300;

// ─── Room Settings ───────────────────────────────────────────────────────────
export const ROOM_CODE_LENGTH = 6;
export const ROOM_EXPIRY_HOURS = 24;

// ─── Square Board (2–4 players): Starting square indices on main track ────────
// The main track has 52 squares (0–51), indexed clockwise from top-left.
// Each player enters at a specific square.
export const SQUARE_BOARD_START_SQUARES: Record<number, number> = {
  0: 0,   // Pink  — enters at index 0
  1: 13,  // Blue  — enters at index 13
  2: 26,  // Green — enters at index 26
  3: 39,  // Orange— enters at index 39
};

// Safe squares on the main track (52 squares, 0-indexed)
export const SQUARE_BOARD_SAFE_SQUARES = new Set([
  0, 8, 13, 21, 26, 34, 39, 47,
]);

// ─── Hexagonal Board (5–6 players): Starting square indices on main track ────
// The hex board has 60 squares on the outer track (10 per arm × 6 arms).
export const HEX_BOARD_MAIN_TRACK_LENGTH = 60;
export const HEX_BOARD_START_SQUARES: Record<number, number> = {
  0: 0,
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
};
export const HEX_BOARD_SAFE_SQUARES = new Set([
  0, 8, 10, 18, 20, 28, 30, 38, 40, 48, 50, 58,
]);
