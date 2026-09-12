'use client';

import { useCallback, useEffect, useRef } from 'react';
import { STORAGE_MUTED } from './constants';
import { useStoredPreference } from './useStoredPreference';

/**
 * Tiny WebAudio blip generator — no asset files, no network.
 *
 * Two things the inline version got wrong:
 *  • Browsers start an AudioContext suspended until a user gesture, so the
 *    very first sound was always dropped. We resume on demand.
 *  • There was no way to turn any of it off, which is not acceptable for a
 *    game people play in company. The preference persists across reloads.
 */
function playSingleClap(ctx: AudioContext, time: number, vol = 0.35) {
  const bursts = [0, 0.011, 0.022, 0.033];
  bursts.forEach((offset, idx) => {
    const isTail = idx === bursts.length - 1;
    const duration = isTail ? 0.12 : 0.012;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * (isTail ? 0.35 : 0.2)));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1050 + Math.random() * 250, time + offset);
    filter.Q.setValueAtTime(2.2, time + offset);

    const gain = ctx.createGain();
    const burstVol = (isTail ? vol : vol * 0.75) * (0.9 + Math.random() * 0.2);
    gain.gain.setValueAtTime(burstVol, time + offset);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + offset + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(time + offset);
    noise.stop(time + offset + duration);
  });
}

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [mutedRaw, setMutedRaw] = useStoredPreference(STORAGE_MUTED, '0');
  const muted = mutedRaw === '1';

  const toggleMute = useCallback(() => {
    setMutedRaw(muted ? '0' : '1');
  }, [muted, setMutedRaw]);

  const tone = useCallback((freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.3) => {
    if (muted) return;
    try {
      if (!ctxRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctxRef.current = new Ctor();
      }
      const ctx = ctxRef.current;
      // Chrome/Safari suspend until the page has seen a gesture.
      if (ctx.state === 'suspended') void ctx.resume();

      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* audio unavailable — never let this break the game */ }
  }, [muted]);

  const sequence = useCallback((notes: [number, number][], type: OscillatorType = 'sine', vol = 0.3) => {
    notes.forEach(([freq, at], i) => {
      setTimeout(() => tone(freq, i === notes.length - 1 ? 0.3 : 0.14, type, vol), at);
    });
  }, [tone]);

  const clap = useCallback(() => {
    if (muted) return;
    try {
      if (!ctxRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctxRef.current = new Ctor();
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();

      const now = ctx.currentTime;
      // Celebratory applause: rhythmic claps that build and taper naturally
      const clapOffsets = [0, 0.10, 0.19, 0.27, 0.35, 0.42, 0.49, 0.57, 0.66, 0.77, 0.90, 1.05, 1.22];
      clapOffsets.forEach((offset, i) => {
        const vol = 0.34 + Math.min(i * 0.015, 0.08);
        playSingleClap(ctx, now + offset, vol);
      });

      // Upbeat celebratory chime alongside the clapping
      sequence([[523, 0], [659, 130], [784, 260], [1047, 400]], 'sine', 0.25);
    } catch { /* audio unavailable */ }
  }, [muted, sequence]);

  const play = {
    dice:    useCallback(() => sequence([[200, 0], [300, 70], [250, 140], [400, 210]], 'square', 0.18), [sequence]),
    move:    useCallback(() => { tone(620, 0.13, 'sine', 0.22); setTimeout(() => tone(820, 0.1, 'sine', 0.18), 90); }, [tone]),
    capture: useCallback(() => { tone(210, 0.28, 'sawtooth', 0.28); setTimeout(() => tone(150, 0.2, 'sawtooth', 0.2), 140); }, [tone]),
    skip:    useCallback(() => { tone(300, 0.16, 'triangle', 0.16); setTimeout(() => tone(220, 0.2, 'triangle', 0.14), 120); }, [tone]),
    turn:    useCallback(() => sequence([[440, 0], [660, 100]], 'sine', 0.22), [sequence]),
    finish:  clap,
    clap,
    win:     useCallback(() => sequence([[523, 0], [659, 150], [784, 300], [1047, 450], [1319, 600]], 'sine', 0.32), [sequence]),
  };

  useEffect(() => () => { void ctxRef.current?.close(); }, []);

  return { play, muted, toggleMute };
}
