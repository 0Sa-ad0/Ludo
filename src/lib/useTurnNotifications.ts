'use client';

import { useEffect, useRef } from 'react';

/** A small red "!" badge, drawn on the fly — there's no static favicon asset
 *  to layer it onto, so this doubles as the tab icon while it's your turn
 *  and you're not looking. */
function makeBadgeFavicon(): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ff2d4a';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 38px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 32, 35);
  return canvas.toDataURL('image/png');
}

function setBadgeFavicon(on: boolean) {
  const existing = document.querySelector<HTMLLinkElement>('link[data-turn-badge]');
  if (!on) { existing?.remove(); return; }
  const href = makeBadgeFavicon();
  if (!href) return;
  const link = existing ?? document.createElement('link');
  link.rel = 'icon';
  link.setAttribute('data-turn-badge', '1');
  link.href = href;
  if (!existing) document.head.appendChild(link);
}

/**
 * Makes "it's your turn" impossible to miss even when this tab isn't the
 * one you're looking at: a browser push notification, the tab title
 * flashing, and a red badge favicon — all cleared the instant you actually
 * switch back to the tab, or your turn ends.
 *
 * Chrome desktop and Chrome on Android both support all three without the
 * page needing to be installed as an app; Safari/iOS support is spottier and
 * deliberately not a design constraint here.
 */
export function useTurnNotifications(isMyTurn: boolean, roomCode: string, playChime: () => void) {
  const wasMyTurn   = useRef(false);
  const askedPermission = useRef(false);
  const flashTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitle = useRef('');

  useEffect(() => {
    if (typeof document !== 'undefined' && !originalTitle.current) {
      originalTitle.current = document.title;
    }
  }, []);

  function clearAlert() {
    if (flashTimer.current) { clearInterval(flashTimer.current); flashTimer.current = null; }
    if (originalTitle.current) document.title = originalTitle.current;
    setBadgeFavicon(false);
  }

  // Ask for permission lazily, only once there's an actual reason to — never
  // block or annoy anyone before their first turn even comes up.
  useEffect(() => {
    if (!isMyTurn || askedPermission.current) return;
    if (typeof Notification === 'undefined') return;
    askedPermission.current = true;
    if (Notification.permission === 'default') void Notification.requestPermission();
  }, [isMyTurn]);

  useEffect(() => {
    const justArrived = isMyTurn && !wasMyTurn.current;
    wasMyTurn.current = isMyTurn;
    if (!isMyTurn) { clearAlert(); return; }
    if (!justArrived) return;

    playChime();
    if (typeof document === 'undefined' || !document.hidden) return;

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const n = new Notification('Your turn!', {
          body: roomCode ? `Room ${roomCode}` : 'Ludo',
          tag: 'ludo-turn',
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch { /* notifications unavailable — the title flash still covers it */ }
    }

    let on = false;
    flashTimer.current = setInterval(() => {
      document.title = on ? originalTitle.current : '🔴 Your Turn — Ludo';
      on = !on;
    }, 1000);
    setBadgeFavicon(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, roomCode]);

  // The instant you actually switch back to the tab, the alert has done its
  // job — stop flashing/badging regardless of whether your turn is still on.
  useEffect(() => {
    function onVisible() { if (!document.hidden) clearAlert(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => () => clearAlert(), []);
}
