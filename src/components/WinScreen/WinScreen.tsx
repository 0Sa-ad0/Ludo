'use client';

import { useEffect, useRef } from 'react';
import type { GameState } from '@/lib/types';
import { PLAYER_COLORS } from '@/lib/constants';
import styles from './WinScreen.module.css';

interface Props {
  gameState: GameState;
  myPlayerIndex: number;
}

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];

export default function WinScreen({ gameState, myPlayerIndex }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  // Confetti
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const neonColors = ['#ff2d78','#00c8ff','#39ff14','#ff6b00','#bf00ff','#ffe600','#ffd700'];
    const pieces: { x: number; y: number; vx: number; vy: number; color: string; size: number; angle: number; va: number }[] = [];

    for (let i = 0; i < 180; i++) {
      pieces.push({
        x:     Math.random() * canvas.width,
        y:     -Math.random() * canvas.height * 0.5,
        vx:    (Math.random() - 0.5) * 4,
        vy:    Math.random() * 3 + 2,
        color: neonColors[Math.floor(Math.random() * neonColors.length)],
        size:  Math.random() * 10 + 5,
        angle: Math.random() * Math.PI * 2,
        va:    (Math.random() - 0.5) * 0.2,
      });
    }

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.85;
        ctx.shadowColor = p.color;
        ctx.shadowBlur  = 8;
        ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
        ctx.restore();
        p.x += p.vx; p.y += p.vy; p.angle += p.va;
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
      }
      animRef.current = requestAnimationFrame(animate);
    }

    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const rankings = gameState.rankings;
  const winner   = gameState.players[rankings[0]];
  const iWon     = rankings[0] === myPlayerIndex;

  return (
    <div className={styles.overlay}>
      <canvas ref={canvasRef} className={styles.confetti} />

      <div className={styles.card}>
        <div className={styles.crown}>👑</div>
        <h2 className={`${styles.title} font-orbitron`} style={{ color: PLAYER_COLORS[winner?.colorIndex]?.hex }}>
          {iWon ? 'YOU WIN!' : `${winner?.name} WINS!`}
        </h2>
        <p className={styles.sub}>Game Over — Final Standings</p>

        <div className={styles.rankings}>
          {rankings.map((playerIdx, rank) => {
            const player = gameState.players[playerIdx];
            if (!player) return null;
            const color = PLAYER_COLORS[player.colorIndex];
            const isMe  = playerIdx === myPlayerIndex;
            return (
              <div key={playerIdx} className={`${styles.rankRow} ${isMe ? styles.isMe : ''}`}
                style={{ borderColor: rank === 0 ? color.hex : 'transparent' }}>
                <span className={styles.medal}>{MEDALS[rank]}</span>
                <span className={styles.playerName} style={{ color: color.hex }}>{player.name}</span>
                {isMe && <span className={styles.youTag}>YOU</span>}
              </div>
            );
          })}
        </div>

        {myPlayerIndex === rankings[0] && (
          <p className={styles.spectate}>Other players are still playing — you can watch!</p>
        )}

        <div className={styles.buttons}>
          <button id="btn-play-again" className="btn btn-primary" onClick={() => window.location.href = '/'}>
            🎮 Play Again
          </button>
          <button id="btn-leaderboard-win" className="btn btn-secondary" onClick={() => window.location.href = '/leaderboard'}>
            🏆 Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}
