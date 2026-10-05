'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { PING_GOOD, PING_FAIR } from '@/lib/constants';

interface Props {
  socket: Socket | null;
  /** Sit inside the game's top bar as a small dot, instead of a fixed badge
   *  in the corner. The number only shows when it's worth noticing. */
  inline?: boolean;
}

export default function PingIndicator({ socket, inline = false }: Props) {
  const [ping, setPing] = useState<number | null>(null);
  const [offline, setOffline] = useState(true);

  useEffect(() => {
    // No socket means nothing to measure; the component renders null in that
    // case, so there is no state worth setting here.
    if (!socket) return;

    // Named handlers so cleanup removes exactly these — the previous version
    // called socket.off('ping_ack') with no handler, which would also strip
    // listeners belonging to anyone else, and never removed connect/disconnect
    // at all, so they piled up on every re-render.
    const onAck = (clientTime: number) => setPing(Date.now() - clientTime);
    const onConnect = () => setOffline(false);
    const onDisconnect = () => { setOffline(true); setPing(null); };

    socket.on('ping_ack', onAck);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const measure = () => {
      if (!socket.connected) { setOffline(true); return; }
      setOffline(false);
      socket.emit('ping', Date.now());
    };

    measure();
    const id = setInterval(measure, 1000);

    return () => {
      clearInterval(id);
      socket.off('ping_ack', onAck);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  // Pages with no socket (the leaderboard) have no latency to report —
  // showing a permanent "OFFLINE" badge there just looks broken.
  if (!socket) return null;

  const cls = offline || ping === null
    ? 'ping-offline'
    : ping < PING_GOOD ? 'ping-good'
    : ping < PING_FAIR ? 'ping-fair'
    : 'ping-bad';

  const label = offline ? 'OFFLINE' : ping !== null ? `${ping}ms` : '…';
  // A healthy connection needs no number — most players never look at it.
  const showLabel = !inline || cls === 'ping-bad' || cls === 'ping-offline';
  const description = `Connection: ${offline ? 'offline' : ping !== null ? `${ping}ms latency` : 'checking'}`;

  return (
    <div
      className={`ping-indicator ${inline ? 'ping-inline' : ''} ${cls}`}
      id="ping-indicator"
      role="status"
      aria-label={description}
      title={description}
    >
      <span className="ping-dot" />
      {showLabel && <span>{label}</span>}
    </div>
  );
}
