// ─── Types ────────────────────────────────────────────────────────────────────

export type PieceStatus = 'home' | 'active' | 'finished';
export type GameStatus  = 'waiting' | 'playing' | 'finished';

export interface Piece {
  id: string;           // e.g. "p0_piece0"
  playerIndex: number;
  pieceIndex: number;
  status: PieceStatus;
  trackPosition: number; // 0–(MAIN_TRACK_LENGTH-1) on main track, or -1 if home
  pathPosition: number;  // 0 = just entered board, increases along full path, -1 = home
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
  pieces: Piece[];
}

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
  rankings: number[];  // player indices in finish order
}

export interface MoveEvent {
  playerIndex: number;
  pieceId: string;
  from: number;
  to: number;
  captured: boolean;
  capturedPieceId?: string;
  isAuto: boolean;
}

// ─── Socket Events ────────────────────────────────────────────────────────────
export interface ServerToClientEvents {
  game_state:       (state: GameState) => void;
  player_joined:    (player: Player) => void;
  player_left:      (playerIndex: number) => void;
  player_auto:      (playerIndex: number) => void;
  player_reconnected:(playerIndex: number) => void;
  dice_rolled:      (playerIndex: number, value: number) => void;
  piece_moved:      (move: MoveEvent) => void;
  game_over:        (rankings: number[]) => void;
  error:            (message: string) => void;
  ping_ack:         (serverTime: number) => void;
  public_url:       (url: string) => void;
}

export interface ClientToServerEvents {
  join_room:    (roomCode: string, playerName: string, password?: string) => void;
  roll_dice:    () => void;
  move_piece:   (pieceId: string) => void;
  ping:         (clientTime: number) => void;
}
