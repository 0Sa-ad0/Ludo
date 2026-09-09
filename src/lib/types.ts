// ─── Types ────────────────────────────────────────────────────────────────────

export type PieceStatus = 'home' | 'active' | 'finished';
export type GameStatus  = 'waiting' | 'playing' | 'finished';

/** A [row, col] cell on the square board, or an [x, y] point on the hex board. */
export type Point = [number, number];

export interface Piece {
  id: string;            // e.g. "p0_piece0"
  playerIndex: number;
  pieceIndex: number;
  status: PieceStatus;
  /** Absolute square on the shared track, or -1 when off it (home / home column / finished). */
  trackPosition: number;
  /** Distance travelled from this player's own start square; -1 while in the home base. */
  pathPosition: number;
}

export interface Player {
  id: string;
  gameId: string;
  name: string;
  colorIndex: number;
  slotIndex: number;
  socketId: string | null;
  isConnected: boolean;
  isAuto: boolean;
  isFinished: boolean;
  finishRank: number | null;
  isHost: boolean;
  pieces: Piece[];
}

/** What the server actually puts on the wire — the password hash is stripped. */
export interface GameState {
  id: string;
  roomCode: string;
  playerCount: number;
  status: GameStatus;
  currentPlayerIndex: number;
  players: Player[];
  diceValue: number | null;
  diceRolled: boolean;
  lastMove: MoveEvent | null;
  winner: number | null;
  rankings: number[];   // player slot indices, in finish order
  createdAt?: number;
  lastActivity?: number;
}

export interface CapturedPiece {
  id: string;
  playerName: string;
}

export interface MoveEvent {
  playerIndex: number;
  pieceId: string;
  isAuto: boolean;
  capturedPieces: CapturedPiece[];
}

// ─── Socket events ────────────────────────────────────────────────────────────

export interface DiceRolledPayload {
  playerIndex: number;
  value: number;
  isAuto?: boolean;
}

export interface PieceMovedPayload {
  playerIndex: number;
  pieceId: string;
  isAuto?: boolean;
  /** The server played this move on the player's behalf because it was the only legal one. */
  forced?: boolean;
  capturedPieces: CapturedPiece[];
}

export interface TurnSkippedPayload {
  playerIndex: number;
  value: number;
  isAuto: boolean;
  /** Set when the skip is the three-6s-in-a-row forfeit, not a no-legal-move skip. */
  reason?: 'three-sixes';
}

export interface ServerToClientEvents {
  game_state:         (state: GameState) => void;
  game_started:       (state: GameState) => void;
  room_created:       (payload: { roomCode: string; playerIndex: number }) => void;
  joined:             (payload: { playerIndex: number }) => void;
  player_left:        (playerIndex: number) => void;
  player_auto:        (playerIndex: number) => void;
  player_reconnected: (playerIndex: number) => void;
  kicked:             () => void;
  dice_rolled:        (payload: DiceRolledPayload) => void;
  piece_moved:        (payload: PieceMovedPayload) => void;
  turn_skipped:       (payload: TurnSkippedPayload) => void;
  game_over:          (rankings: number[]) => void;
  error:              (message: string) => void;
  ping_ack:           (clientTime: number) => void;
}

export interface ClientToServerEvents {
  create_room: (payload: { playerCount: number; playerName: string; password?: string }) => void;
  join_room:   (payload: { roomCode: string; playerName: string; password?: string }) => void;
  start_game:  () => void;
  kick_player: (payload: { slotIndex: number }) => void;
  leave_room:  () => void;
  roll_dice:   () => void;
  move_piece:  (payload: { pieceId: string }) => void;
  ping:        (clientTime: number) => void;
}

/** Stored per-room in sessionStorage so a refresh can rejoin the same seat. */
export interface StoredJoin {
  playerName: string;
  password?: string;
}
