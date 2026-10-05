'use client';

import { useState } from 'react';
import type { GameState, Player } from '@/lib/types';
import { PLAYER_COLORS, TEAM_NAMES } from '@/lib/constants';
import { MIN_PLAYERS } from '@/lib/board';
import styles from './WaitingRoom.module.css';

const TEAM_SIZE = 2;

interface Props {
  gameState: GameState;
  roomCode: string;
  shareUrl: string;
  /** True when shareUrl is the ngrok address (reachable from any network),
   *  false when it's the LAN address (same WiFi only). */
  shareIsPublic: boolean;
  /** A second link built on the host's mDNS hostname instead of its raw LAN
   *  IP — keeps working if that IP changes later, on devices that support
   *  it. Empty string when unavailable. */
  stableUrl: string;
  myPlayerIndex: number;
  onStart: () => void;
  onKick: (slotIndex: number) => void;
  onLeave: () => void;
  onChooseTeam: (team: number) => void;
}

type CopyTarget = 'code' | 'url' | 'stable';

export default function WaitingRoom({
  gameState, roomCode, shareUrl, shareIsPublic, stableUrl, myPlayerIndex,
  onStart, onKick, onLeave, onChooseTeam,
}: Props) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  const me       = gameState.players[myPlayerIndex];
  const isHost   = !!me?.isHost;
  const joined   = gameState.players.length;
  const teamMode = !!gameState.teamMode;
  const canStartEarly = isHost && !teamMode && joined >= MIN_PLAYERS && joined < gameState.playerCount;

  // navigator.clipboard requires a "secure context" — HTTPS, or localhost.
  // This app's whole point is playing over plain http://<LAN-IP>, which the
  // browser does NOT consider secure, so `navigator.clipboard` is undefined
  // there and the async API silently does nothing. execCommand('copy') is
  // deprecated but, unlike the Clipboard API, isn't gated on a secure
  // context — it's the only thing that actually copies text on that origin.
  function legacyCopy(text: string): boolean {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  async function copy(text: string, which: CopyTarget) {
    let ok = false;
    if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; }
    }
    if (!ok) ok = legacyCopy(text);
    if (ok) {
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
    }
  }

  // Plain render helpers, not nested components — a component defined in
  // here would be a new type every render, remounting each row (and
  // replaying its pop-in animation) on every state broadcast.
  function playerRow(player: Player) {
    const color = PLAYER_COLORS[player.colorIndex];
    const isMe  = player.slotIndex === myPlayerIndex;
    return (
      <div key={player.id} className={`${styles.playerSlot} ${styles.playerSlotFilled}`}
        style={{ borderColor: `${color?.hex}60` }} data-testid={`waiting-player-${player.name}`}>
        <div className={styles.playerDot} style={{ background: color?.hex, boxShadow: `0 0 8px ${color?.hex}` }} />
        <span className={styles.playerName}>{player.name}</span>
        {player.isHost && <span className={styles.hostBadge} title="Host">👑</span>}
        {isMe && <span className={styles.youBadge}>YOU</span>}
        {isHost && !isMe && (
          <button className={styles.kickBtn} onClick={() => onKick(player.slotIndex)}
            aria-label={`Remove ${player.name}`} title={`Remove ${player.name}`}>
            ✕
          </button>
        )}
      </div>
    );
  }

  function emptyRow(key: string, label: string) {
    return (
      <div key={key} className={`${styles.playerSlot} ${styles.playerSlotEmpty}`}>
        <span className={styles.spinner2} aria-hidden />
        <span className={styles.emptyText}>{label}</span>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.card} card`}>
        <h2 className={`${styles.title} font-orbitron neon-text-pink`}>
          {teamMode ? 'Team Game · 2 vs 2' : 'Waiting for Players'}
        </h2>
        <p className={styles.sub} data-testid="waiting-count">
          {joined} / {gameState.playerCount} joined
        </p>

        <div className={styles.codeBox}>
          <span className={styles.codeLabel}>Room code</span>
          <div className={styles.codeRow}>
            <span className={`${styles.code} font-orbitron`} data-testid="room-code">{roomCode}</span>
            <button className={`btn btn-ghost ${styles.copyBtn}`} onClick={() => copy(roomCode, 'code')} id="btn-copy-code">
              {copied === 'code' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {shareUrl && (
          <div className={styles.urlBox}>
            <div className={styles.urlHead}>
              <span className={styles.urlLabel}>
                Invite link · {shareIsPublic ? 'works from anywhere' : 'same WiFi only'}
              </span>
              <button className={`btn btn-ghost ${styles.copyBtn}`} onClick={() => copy(shareUrl, 'url')}
                id="btn-copy-url" aria-label="Copy invite link">
                {copied === 'url' ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
            <span className={styles.url} data-testid="share-url">{shareUrl}</span>
          </div>
        )}

        {stableUrl && (
          <div className={styles.urlBox}>
            <div className={styles.urlHead}>
              <span className={styles.urlLabel}>Backup link · same WiFi</span>
              <button className={`btn btn-ghost ${styles.copyBtn}`} onClick={() => copy(stableUrl, 'stable')}
                id="btn-copy-stable-url" aria-label="Copy backup link">
                {copied === 'stable' ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
            <span className={styles.url}>{stableUrl}</span>
            <span className={styles.urlNote}>Use this one if the invite link stops working.</span>
          </div>
        )}

        {teamMode ? (
          <div className={styles.teams}>
            {[0, 1].map((team) => {
              const members = gameState.players.filter((p) => p.team === team);
              const canJoin = !!me && me.team !== team && members.length < TEAM_SIZE;
              return (
                <div key={team} className={styles.teamGroup} data-testid={`team-group-${team}`}>
                  <div className={styles.teamHead}>
                    <span className={`${styles.teamName} font-orbitron`}>{TEAM_NAMES[team]}</span>
                    {canJoin && (
                      <button id={`btn-join-team-${team}`} className={`btn btn-ghost ${styles.copyBtn}`}
                        onClick={() => onChooseTeam(team)}>
                        Switch here
                      </button>
                    )}
                  </div>
                  {members.map(playerRow)}
                  {Array.from({ length: TEAM_SIZE - members.length }, (_, i) => emptyRow(`open-${i}`, 'Open seat'))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.playersList}>
            {Array.from({ length: gameState.playerCount }, (_, i) => {
              const player = gameState.players[i];
              return player ? playerRow(player) : emptyRow(`empty-${i}`, 'Waiting…');
            })}
          </div>
        )}

        {canStartEarly && (
          <button id="btn-start-game" className="btn btn-primary" style={{ width: '100%' }} onClick={onStart}>
            ▶ Start with {joined} player{joined === 1 ? '' : 's'}
          </button>
        )}

        <p className={styles.hint}>
          {teamMode
            ? 'Starts automatically when all 4 players are in. Partners sit opposite each other.'
            : isHost
              ? joined < MIN_PLAYERS
                ? `Waiting for at least ${MIN_PLAYERS} players…`
                : `Starts automatically at ${gameState.playerCount} — or start early above.`
              : `Starts automatically when all ${gameState.playerCount} players join.`}
        </p>

        <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onLeave} id="btn-leave-room">
          Leave room
        </button>
      </div>
    </div>
  );
}
