'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import styles from './PingIndicator.module.css';

interface Props { socket: Socket | null; }

export default function PingIndicator({ socket }: Props) {
  const [ping, setPing] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!socket) return;

    const measure = () => {
      if (!socket.connected) { setOffline(true); return; }
      setOffline(false);
      const t0 = Date.now();
      socket.emit('ping', t0);
    };

    socket.on('ping_ack', (serverTime: number) => {
      const rtt = Date.now() - serverTime;
      setPing(rtt);
    });

    socket.on('disconnect', () => setOffline(true));
    socket.on('connect',    () => setOffline(false));

    measure();
    intervalRef.current = setInterval(measure, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      socket.off('ping_ack');
    };
  }, [socket]);

  const pingClass = offline
    ? styles.offline
    : ping === null
      ? styles.offline
      : ping < 100
        ? styles.good
        : ping < 300
          ? styles.fair
          : styles.bad;

  return (
    <div className={`ping-indicator ${pingClass}`} id="ping-indicator" aria-label={`Ping: ${offline ? 'offline' : ping !== null ? ping + 'ms' : '...'}`}>
      <span className="ping-dot" />
      <span>{offline ? 'OFFLINE' : ping !== null ? `${ping}ms` : '...'}</span>
    </div>
  );
}
