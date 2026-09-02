'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, Player } from '@/lib/types';
import { PLAYER_COLORS } from '@/lib/constants';
import PingIndicator from '@/components/PingIndicator/PingIndicator';
import SquareBoard from '@/components/Board/SquareBoard';
import HexBoard from '@/components/Board/HexBoard';
import DiceRoller from '@/components/Dice/DiceRoller';
import PlayerPanel from '@/components/PlayerPanel/PlayerPanel';
import WinScreen from '@/components/WinScreen/WinScreen';
import WaitingRoom from '@/components/WaitingRoom/WaitingRoom';
import styles from './game.module.css';

interface GamePageProps {
  params: { roomId: string };
}

export default function GamePage({ params }: GamePageProps) {
  const { roomId } = params;
  const isCreate = roomId === 'create';

  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState]         = useState<GameState | null>(null);
  const [myPlayerIndex, setMyPlayerIndex] = useState<number>(-1);
  const [roomCode, setRoomCode]           = useState<string>('');
  const [error, setError]                 = useState<string>('');
  const [rollingDice, setRollingDice]     = useState(false);
  const [movingPiece, setMovingPiece]     = useState<string | null>(null);
  const [lastCapture, setLastCapture]     = useState<string | null>(null);
  const [shareUrl, setShareUrl]           = useState('');
  const [connecting, setConnecting]       = useState(true);

  const audioCtxRef = useRef<AudioContext | null>(null);

  function getAudioCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }

  function playTone(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.3) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(); osc.stop(ctx.currentTime + duration);
    } catch { /* audio not available */ }
  }

  function playDiceSound() {
    [200, 300, 250, 400].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'square', 0.2), i * 80));
  }

  function playMoveSound() {
    playTone(600, 0.15, 'sine', 0.25);
    setTimeout(() => playTone(800, 0.1, 'sine', 0.2), 100);
  }

  function playCaptureSound() {
    playTone(200, 0.3, 'sawtooth', 0.3);
    setTimeout(() => playTone(150, 0.2, 'sawtooth', 0.2), 150);
  }

  function playWinSound() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => playTone(f, 0.4, 'sine', 0.35), i * 150));
  }

  useEffect(() => {
    const socket = io({ path: '/api/socket', transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnecting(false);
      if (isCreate) {
        const data = JSON.parse(sessionStorage.getItem('ludo_create') || '{}');
        socket.emit('create_room', data);
      } else {
        const data = JSON.parse(sessionStorage.getItem('ludo_join') || '{}');
        socket.emit('join_room', { ...data, roomCode: roomId });
      }
    });

    socket.on('room_created', ({ roomCode: rc, playerIndex }: any) => {
      setRoomCode(rc);
      setMyPlayerIndex(playerIndex);
      // Build share URL
      const base = window.location.origin;
      setShareUrl(`${base}/game/${rc}`);
    });

    socket.on('joined', ({ playerIndex }: any) => {
      setMyPlayerIndex(playerIndex);
    });

    socket.on('game_state', (state: GameState) => {
      setGameState(state);
      if (state.roomCode) setRoomCode(state.roomCode);
    });

    socket.on('dice_rolled', ({ playerIndex, value }: any) => {
      playDiceSound();
      setRollingDice(false);
    });

    socket.on('piece_moved', ({ pieceId, playerIndex, isAuto }: any) => {
      setMovingPiece(pieceId);
      playMoveSound();
      setTimeout(() => setMovingPiece(null), 600);
    });

    socket.on('game_over', (rankings: number[]) => {
      playWinSound();
    });

    socket.on('error', (msg: string) => {
      setError(msg);
      setTimeout(() => setError(''), 4000);
    });

    return () => { socket.disconnect(); };
  }, [roomId, isCreate]);

  const handleRollDice = useCallback(() => {
    if (!socketRef.current) return;
    if (gameState?.currentPlayerIndex !== myPlayerIndex) return;
    if (gameState?.diceRolled) return;
    setRollingDice(true);
    socketRef.current.emit('roll_dice');
  }, [gameState, myPlayerIndex]);

  const handleMovePiece = useCallback((pieceId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('move_piece', { pieceId });
  }, []);

  const isMyTurn = gameState?.status === 'playing' && gameState.currentPlayerIndex === myPlayerIndex;
  const myPlayer = gameState?.players[myPlayerIndex];
  const isHex = gameState && gameState.playerCount >= 5;

  if (connecting) {
    return (
      <div className={styles.centered}>
        <PingIndicator socket={socketRef.current} />
        <div className={styles.connectingText}>
          <div className={styles.spinner} />
          <span className="font-orbitron">Connecting…</span>
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  if (gameState.status === 'waiting') {
    return (
      <div className={styles.centered}>
        <PingIndicator socket={socketRef.current} />
        <WaitingRoom
          gameState={gameState}
          roomCode={roomCode}
          shareUrl={shareUrl}
          myPlayerIndex={myPlayerIndex}
        />
      </div>
    );
  }

  return (
    <div className={styles.gamePage}>
      <PingIndicator socket={socketRef.current} />

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.roomInfo}>
          <span className={styles.roomLabel}>ROOM</span>
          <span className={`${styles.roomCode} font-orbitron`}>{roomCode}</span>
        </div>
        <div className={styles.turnInfo}>
          {gameState.status === 'playing' && (
            <span className={styles.turnText} style={{ color: PLAYER_COLORS[gameState.players[gameState.currentPlayerIndex]?.colorIndex]?.hex }}>
              {isMyTurn ? '⚡ Your Turn' : `${gameState.players[gameState.currentPlayerIndex]?.name}'s Turn`}
            </span>
          )}
        </div>
      </div>

      {/* Main game area */}
      <div className={styles.gameArea}>
        {/* Left panel — players 0 & 2 */}
        <div className={styles.sidePanel}>
          {gameState.players.filter((_, i) => i % 2 === 0).map(player => (
            <PlayerPanel key={player.id} player={player} isMyTurn={gameState.currentPlayerIndex === player.slotIndex} isMe={player.slotIndex === myPlayerIndex} />
          ))}
        </div>

        {/* Board */}
        <div className={styles.boardContainer}>
          {isHex ? (
            <HexBoard gameState={gameState} myPlayerIndex={myPlayerIndex} movingPiece={movingPiece} onPieceClick={handleMovePiece} />
          ) : (
            <SquareBoard gameState={gameState} myPlayerIndex={myPlayerIndex} movingPiece={movingPiece} onPieceClick={handleMovePiece} />
          )}
        </div>

        {/* Right panel — players 1 & 3 */}
        <div className={styles.sidePanel}>
          {gameState.players.filter((_, i) => i % 2 === 1).map(player => (
            <PlayerPanel key={player.id} player={player} isMyTurn={gameState.currentPlayerIndex === player.slotIndex} isMe={player.slotIndex === myPlayerIndex} />
          ))}
        </div>
      </div>

      {/* Dice area */}
      <div className={styles.diceArea}>
        <DiceRoller
          value={gameState.diceValue}
          rolling={rollingDice}
          canRoll={isMyTurn && !gameState.diceRolled && !myPlayer?.isFinished}
          onRoll={handleRollDice}
          currentPlayerColor={PLAYER_COLORS[gameState.players[gameState.currentPlayerIndex]?.colorIndex]?.hex}
        />
      </div>

      {/* Win Screen overlay */}
      {gameState.status === 'finished' && (
        <WinScreen gameState={gameState} myPlayerIndex={myPlayerIndex} />
      )}
    </div>
  );
}
