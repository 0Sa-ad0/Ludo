'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import type {
  GameState, DiceRolledPayload, PieceMovedPayload, TurnSkippedPayload, StoredJoin,
} from '@/lib/types';
import {
  PLAYER_COLORS, STORAGE_CREATE, STORAGE_ROOM, STORAGE_NAME,
  DICE_ROLL_MIN_MS, ROLL_TIMEOUT_MS, TOAST_MS, MOVE_ANIM_MS,
} from '@/lib/constants';
import { useSound } from '@/lib/useSound';
import PingIndicator from '@/components/PingIndicator/PingIndicator';
import SquareBoard from '@/components/Board/SquareBoard';
import HexBoard from '@/components/Board/HexBoard';
import DiceRoller from '@/components/Dice/DiceRoller';
import PlayerPanel from '@/components/PlayerPanel/PlayerPanel';
import WinScreen from '@/components/WinScreen/WinScreen';
import WaitingRoom from '@/components/WaitingRoom/WaitingRoom';
import JoinPrompt from '@/components/JoinPrompt/JoinPrompt';
import styles from './game.module.css';

interface GamePageProps {
  params: Promise<{ roomId: string }>;
}

function readStored<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export default function GamePage({ params }: GamePageProps) {
  const { roomId } = use(params);
  const isCreate = roomId === 'create';
  const router = useRouter();

  // The ref is for imperative use inside callbacks; the state copy is what
  // render passes down, since reading a ref during render isn't allowed (and
  // wouldn't re-render PingIndicator when the socket first appears anyway).
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState]     = useState<GameState | null>(null);
  const [myPlayerIndex, setMyIndex]   = useState(-1);
  const [roomCode, setRoomCode]       = useState(isCreate ? '' : roomId);
  const [error, setError]             = useState('');
  const [notice, setNotice]           = useState('');
  const [rollingDice, setRolling]     = useState(false);
  const [movingPiece, setMovingPiece] = useState<string | null>(null);
  const [capturing, setCapturing]     = useState<string | null>(null);
  const [connecting, setConnecting]   = useState(true);
  const [kicked, setKicked]           = useState(false);
  // Opening a shared /game/CODE link has no stored name, so ask for one
  // instead of silently joining the room as "undefined".
  const [needsName, setNeedsName]     = useState(false);
  // Set when the server rejected our own join/create attempt (name taken,
  // wrong password, room full…) so we can send the player back to the name
  // prompt to fix it and retry, instead of stranding them on a dead end.
  const [joinError, setJoinError]     = useState('');

  const { play, muted, toggleMute } = useSound();
  // Socket handlers are registered once, so they read the moving parts through
  // refs rather than closing over a stale render's values. The refs are
  // updated in effects, never during render.
  const playRef    = useRef(play);
  const stateRef   = useRef<GameState | null>(null);
  const myIndexRef = useRef(-1);

  useEffect(() => { playRef.current = play; }, [play]);
  useEffect(() => { myIndexRef.current = myPlayerIndex; }, [myPlayerIndex]);

  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollStartRef = useRef(0);

  const toast = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? '' : n)), TOAST_MS);
  }, []);

  // ── Decide up front whether we have enough to join ──────────────────────
  const [joinInfo, setJoinInfo] = useState<(StoredJoin & { playerCount?: number }) | null>(null);

  // The base to build the share link from. `window.location.origin` is wrong
  // whenever the host opened the page via localhost — that URL means nothing
  // on anyone else's device. Prefer, in order: a detected ngrok public URL,
  // then the server's own LAN-advertised address (fixes the localhost case),
  // then finally the page's own origin (already correct if opened via LAN IP
  // or ngrok's forwarded domain).
  const [publicBase, setPublicBase] = useState<{ url: string | null; lanUrl: string | null }>({
    url: null, lanUrl: null,
  });
  useEffect(() => {
    fetch('/api/public-url')
      .then((r) => r.json())
      .then((d) => setPublicBase({ url: d.url ?? null, lanUrl: d.lanUrl ?? null }))
      .catch(() => {});
  }, []);

  // sessionStorage doesn't exist during SSR, so this decision can only be made
  // after mount — reading it during render would break hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = isCreate
      ? readStored<StoredJoin & { playerCount: number }>(STORAGE_CREATE)
      : readStored<StoredJoin>(STORAGE_ROOM(roomId));

    if (stored?.playerName) { setJoinInfo(stored); setNeedsName(false); }
    else if (isCreate)      { setError('Missing room setup — start again from the lobby.'); setConnecting(false); }
    else                    { setNeedsName(true); setConnecting(false); }
  }, [isCreate, roomId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Socket lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!joinInfo) return;

    const socket = io({ path: '/api/socket', transports: ['websocket'] });
    socketRef.current = socket;
    // Publishing the newly-created connection so children can subscribe to it
    // is exactly what an effect is for; it runs once per mount, not per render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(socket);

    socket.on('connect', () => {
      setConnecting(false);
      if (isCreate) {
        socket.emit('create_room', {
          playerName: joinInfo.playerName,
          playerCount: joinInfo.playerCount ?? 4,
          password: joinInfo.password ?? '',
        });
      } else {
        socket.emit('join_room', {
          roomCode: roomId,
          playerName: joinInfo.playerName,
          password: joinInfo.password ?? '',
        });
      }
    });

    socket.on('room_created', ({ roomCode: rc, playerIndex }) => {
      setRoomCode(rc);
      setMyIndex(playerIndex);
      // Swap the address bar from /game/create to the real code — otherwise a
      // refresh spins up a brand-new room and strands the host's seat.
      window.history.replaceState(null, '', `/game/${rc}`);
      try {
        sessionStorage.setItem(STORAGE_ROOM(rc), JSON.stringify({
          playerName: joinInfo.playerName, password: joinInfo.password ?? '',
        }));
      } catch { /* ignore */ }
    });

    socket.on('joined', ({ playerIndex }) => {
      setMyIndex(playerIndex);
      try {
        sessionStorage.setItem(STORAGE_ROOM(roomId), JSON.stringify({
          playerName: joinInfo.playerName, password: joinInfo.password ?? '',
        }));
      } catch { /* ignore */ }
    });

    socket.on('game_state', (state) => {
      stateRef.current = state;
      setGameState(state);
      if (state.roomCode) setRoomCode(state.roomCode);
    });

    /** Name a player by slot from the freshest state we've received. */
    const nameOf = (index: number) => stateRef.current?.players[index]?.name;

    socket.on('dice_rolled', ({ value, isAuto }: DiceRolledPayload) => {
      playRef.current.dice();
      // Let the tumble finish even when the server answers in 5ms on LAN —
      // stopping it the instant the value arrives meant it never animated.
      const elapsed = Date.now() - rollStartRef.current;
      const wait = isAuto ? 0 : Math.max(0, DICE_ROLL_MIN_MS - elapsed);
      setTimeout(() => setRolling(false), wait);
      void value;
    });

    socket.on('piece_moved', ({ pieceId, capturedPieces }: PieceMovedPayload) => {
      setMovingPiece(pieceId);
      setTimeout(() => setMovingPiece((p) => (p === pieceId ? null : p)), MOVE_ANIM_MS);

      if (capturedPieces?.length) {
        playRef.current.capture();
        const names = Array.from(new Set(capturedPieces.map((c) => c.playerName)));
        toast(`💥 Sent ${names.join(', ')} home!`);
        setCapturing(pieceId);
        setTimeout(() => setCapturing((p) => (p === pieceId ? null : p)), 800);
      } else {
        playRef.current.move();
      }
    });

    socket.on('turn_skipped', ({ playerIndex, value, reason }: TurnSkippedPayload) => {
      playRef.current.skip();
      setRolling(false);
      const mine = playerIndex === myIndexRef.current;
      const who = mine ? 'You' : (nameOf(playerIndex) ?? 'Player');

      if (reason === 'three-sixes') {
        toast(`🎲🎲🎲 Three 6s in a row — ${mine ? 'your' : `${who}'s`} turn is forfeited!`);
        return;
      }

      // A 6 keeps the turn, so "skipped" would be wrong — they roll again.
      const outcome = value === 6
        ? (mine ? 'Roll again.' : `${who} rolls again.`)
        : (mine ? 'Your turn was skipped.' : `${who}'s turn was skipped.`);
      toast(`🎲 ${value} — no legal move. ${outcome}`);
    });

    socket.on('player_left', (i) => {
      const name = nameOf(i);
      if (name) toast(`${name} lost connection…`);
    });
    socket.on('player_auto', (i) => {
      const name = nameOf(i);
      if (name) toast(`${name} is now on AUTO 🤖`);
    });
    socket.on('player_reconnected', (i) => {
      const name = nameOf(i);
      if (name) toast(`${name} is back ✅`);
    });

    socket.on('game_over', () => playRef.current.win());
    socket.on('kicked', () => { setKicked(true); socket.disconnect(); });

    socket.on('error', (msg: string) => {
      // Never successfully joined yet (myIndexRef is only set by 'joined' /
      // 'room_created') — this is a rejection of the join itself, so send
      // the player back to the name prompt to fix it and try again, rather
      // than stranding them on a dead-end error screen with no way back in.
      if (!isCreate && myIndexRef.current === -1) {
        setJoinError(msg);
        setNeedsName(true);
        setJoinInfo(null);
        return;
      }
      setError(msg);
      setRolling(false);
      setTimeout(() => setError((e) => (e === msg ? '' : e)), 4000);
    });

    socket.on('disconnect', () => setRolling(false));

    return () => { socket.disconnect(); socketRef.current = null; setSocket(null); };
  }, [joinInfo, isCreate, roomId, toast]);

  useEffect(() => () => { if (rollTimerRef.current) clearTimeout(rollTimerRef.current); }, []);

  // ── Derived ─────────────────────────────────────────────────────────────
  const shareUrl = useMemo(() => {
    const code = roomCode || (isCreate ? '' : roomId);
    if (!code || typeof window === 'undefined') return '';
    let base = window.location.origin;
    if (publicBase.url) {
      base = publicBase.url;
    } else if (publicBase.lanUrl) {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') base = publicBase.lanUrl;
    }
    return `${base}/game/${code}`;
  }, [roomCode, roomId, isCreate, publicBase]);

  const myPlayer  = gameState?.players[myPlayerIndex];
  const isMyTurn  = gameState?.status === 'playing' && gameState.currentPlayerIndex === myPlayerIndex;
  const isHex     = !!gameState && gameState.playerCount >= 5;
  const current   = gameState?.players[gameState.currentPlayerIndex];
  const turnColor = current ? PLAYER_COLORS[current.colorIndex]?.hex : '#888';

  // With 5–6 players an every-other-one split leaves three names crushed into
  // an 80px column, so hex games get a single horizontal strip instead.
  const splitPanels = !isHex;
  const leftPanel  = useMemo(
    () => (gameState ? gameState.players.filter((_, i) => !splitPanels || i % 2 === 0) : []),
    [gameState, splitPanels],
  );
  const rightPanel = useMemo(
    () => (gameState && splitPanels ? gameState.players.filter((_, i) => i % 2 === 1) : []),
    [gameState, splitPanels],
  );

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleRoll = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !isMyTurn || gameState?.diceRolled || rollingDice) return;
    rollStartRef.current = Date.now();
    setRolling(true);
    socket.emit('roll_dice');
    // If the roll is never answered (rejected, or the socket dropped), don't
    // leave the button spinning for ever.
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => setRolling(false), ROLL_TIMEOUT_MS);
  }, [isMyTurn, gameState?.diceRolled, rollingDice]);

  const handleMove = useCallback((pieceId: string) => {
    socketRef.current?.emit('move_piece', { pieceId });
  }, []);

  const handleLeave = useCallback(() => {
    if (!window.confirm('Leave this game?')) return;
    socketRef.current?.emit('leave_room');
    try { sessionStorage.removeItem(STORAGE_ROOM(roomCode)); } catch { /* ignore */ }
    router.push('/');
  }, [roomCode, router]);

  const handleStart = useCallback(() => socketRef.current?.emit('start_game'), []);
  const handleKick  = useCallback((slotIndex: number) => {
    socketRef.current?.emit('kick_player', { slotIndex });
  }, []);

  const handleNameSubmit = useCallback((playerName: string, password: string) => {
    const info = { playerName, password };
    try {
      sessionStorage.setItem(STORAGE_ROOM(roomId), JSON.stringify(info));
      localStorage.setItem(STORAGE_NAME, playerName);
    } catch { /* ignore */ }
    setJoinError('');
    setNeedsName(false);
    setConnecting(true);
    setJoinInfo(info);
  }, [roomId]);

  // ── Screens ─────────────────────────────────────────────────────────────
  if (kicked) {
    return (
      <Shell socket={socket}>
        <div className={styles.message}>
          <h2 className="font-orbitron">Removed from room</h2>
          <p>The host removed you from this game.</p>
          <Link href="/" className="btn btn-secondary">← Back to Lobby</Link>
        </div>
      </Shell>
    );
  }

  if (needsName) {
    return (
      <Shell socket={socket}>
        <JoinPrompt roomCode={roomId} onSubmit={handleNameSubmit} errorMessage={joinError} />
      </Shell>
    );
  }

  if (connecting || (!gameState && !error)) {
    return (
      <Shell socket={socket}>
        <div className={styles.connectingText}>
          <div className={styles.spinner} />
          <span className="font-orbitron">{connecting ? 'Connecting…' : 'Loading…'}</span>
        </div>
      </Shell>
    );
  }

  if (!gameState) {
    return (
      <Shell socket={socket}>
        <div className={styles.message}>
          <div className={styles.errorBox} data-testid="error-banner">{error}</div>
          <Link href="/" className="btn btn-secondary">← Back to Lobby</Link>
        </div>
      </Shell>
    );
  }

  if (gameState.status === 'waiting') {
    return (
      <Shell socket={socket}>
        {error && <div className={styles.errorBanner} data-testid="error-banner">{error}</div>}
        <WaitingRoom
          gameState={gameState}
          roomCode={roomCode}
          shareUrl={shareUrl}
          myPlayerIndex={myPlayerIndex}
          onStart={handleStart}
          onKick={handleKick}
          onLeave={handleLeave}
        />
      </Shell>
    );
  }

  return (
    <div className={styles.gamePage}>
      <PingIndicator socket={socket} />

      {error  && <div className={styles.errorBanner}  data-testid="error-banner">{error}</div>}
      {notice && <div className={styles.noticeBanner} data-testid="capture-banner">{notice}</div>}

      <div className={styles.topBar}>
        <div className={styles.roomInfo}>
          <span className={styles.roomLabel}>ROOM</span>
          <span className={`${styles.roomCode} font-orbitron`} data-testid="room-code">{roomCode}</span>
        </div>

        <div className={styles.turnInfo}>
          <span
            className={styles.turnText}
            data-testid="turn-text"
            data-my-turn={isMyTurn}
            style={{ color: turnColor }}
          >
            {myPlayer?.isFinished
              ? `👑 Spectating — finished #${myPlayer.finishRank}`
              : isMyTurn
                ? '⚡ Your Turn'
                : `${current?.name ?? '…'}'s Turn`}
          </span>
        </div>

        <div className={styles.topActions}>
          <button
            className={styles.iconBtn}
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            className={styles.iconBtn}
            onClick={handleLeave}
            aria-label="Leave game"
            title="Leave game"
          >
            🚪
          </button>
        </div>
      </div>

      <div className={`${styles.gameArea} ${isHex ? styles.gameAreaWide : ''}`}>
        <div className={styles.sidePanel}>
          {leftPanel.map((p) => (
            <PlayerPanel key={p.id} player={p}
              isMyTurn={gameState.currentPlayerIndex === p.slotIndex}
              isMe={p.slotIndex === myPlayerIndex} />
          ))}
        </div>

        <div className={styles.boardContainer}>
          {isHex ? (
            <HexBoard gameState={gameState} myPlayerIndex={myPlayerIndex}
              movingPiece={movingPiece} capturingPiece={capturing} onPieceClick={handleMove} />
          ) : (
            <SquareBoard gameState={gameState} myPlayerIndex={myPlayerIndex}
              movingPiece={movingPiece} capturingPiece={capturing} onPieceClick={handleMove} />
          )}
        </div>

        {splitPanels && (
          <div className={styles.sidePanel}>
            {rightPanel.map((p) => (
              <PlayerPanel key={p.id} player={p}
                isMyTurn={gameState.currentPlayerIndex === p.slotIndex}
                isMe={p.slotIndex === myPlayerIndex} />
            ))}
          </div>
        )}
      </div>

      <div className={styles.diceArea}>
        <DiceRoller
          value={gameState.diceValue}
          rolling={rollingDice}
          canRoll={!!isMyTurn && !gameState.diceRolled && !myPlayer?.isFinished}
          waitingForMove={!!isMyTurn && gameState.diceRolled}
          onRoll={handleRoll}
          currentPlayerColor={turnColor}
        />
      </div>

      {gameState.status === 'finished' && (
        <WinScreen gameState={gameState} myPlayerIndex={myPlayerIndex} />
      )}
    </div>
  );
}

/** Centred page chrome shared by every pre-game screen. */
function Shell({ socket, children }: { socket: Socket | null; children: React.ReactNode }) {
  return (
    <div className={styles.centered}>
      <PingIndicator socket={socket} />
      {children}
    </div>
  );
}
