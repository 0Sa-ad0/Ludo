'use client';

import { useEffect, useRef } from 'react';

// NEXT_PUBLIC_ so it's readable in the browser — Jamendo's client id is not a
// secret (it identifies the app, not a user), same as any other public API
// key meant to be called straight from client-side JS.
const JAMENDO_CLIENT_ID = process.env.NEXT_PUBLIC_JAMENDO_CLIENT_ID;
const JAMENDO_TRACKS_URL = 'https://api.jamendo.com/v3.0/tracks/';
// Jamendo's tag vocabulary doesn't have "phonk" or "electric guitar" as a
// literal genre — "rock" is the closest real tag to that energy.
const GENRE_TAG = 'rock';

interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  audio: string;
}

// Module-level, not per-hook-instance: the track list is the same for every
// player in every room, so there's no reason to re-fetch it per mount.
let cachedTracks: JamendoTrack[] | null = null;
let fetchPromise: Promise<JamendoTrack[]> | null = null;

function fetchTracks(): Promise<JamendoTrack[]> {
  if (cachedTracks) return Promise.resolve(cachedTracks);
  if (fetchPromise) return fetchPromise;
  const url = `${JAMENDO_TRACKS_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=40`
    + `&tags=${GENRE_TAG}&audioformat=mp32&boost=popularity_total`;
  fetchPromise = fetch(url)
    .then((r) => r.json())
    .then((data: { results?: JamendoTrack[] }) => {
      cachedTracks = (data.results ?? []).filter((t) => !!t.audio);
      return cachedTracks;
    })
    .catch(() => { cachedTracks = []; return cachedTracks!; });
  return fetchPromise;
}

function pickRandom<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

/**
 * Random rock/electric-guitar-leaning background music, streamed from
 * Jamendo's free Creative-Commons-licensed catalog — a fresh random track
 * every time one finishes, for as long as the page stays open.
 *
 * Needs a free Jamendo client id (see .env.example); without one this is a
 * no-op — the game runs exactly as before, just silent, never an error.
 *
 * Respects the same mute toggle as the sound effects, and only ever starts
 * on a real click/tap: browsers block audio-with-sound from playing before
 * the page has seen a genuine user gesture.
 */
export function useBackgroundMusic(muted: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  useEffect(() => {
    if (!JAMENDO_CLIENT_ID || typeof window === 'undefined') return undefined;

    const audio = new Audio();
    audio.volume = 0.35;
    audioRef.current = audio;

    async function playNext() {
      const tracks = await fetchTracks();
      const track = pickRandom(tracks);
      if (!track || !audioRef.current) return;
      audioRef.current.src = track.audio;
      if (!mutedRef.current) void audioRef.current.play().catch(() => {});
    }

    audio.addEventListener('ended', playNext);

    function onFirstGesture() {
      if (startedRef.current) return;
      startedRef.current = true;
      void playNext();
      document.removeEventListener('pointerdown', onFirstGesture);
    }
    document.addEventListener('pointerdown', onFirstGesture);

    return () => {
      audio.removeEventListener('ended', playNext);
      audio.pause();
      audioRef.current = null;
      document.removeEventListener('pointerdown', onFirstGesture);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) audio.pause();
    else if (startedRef.current && audio.src) void audio.play().catch(() => {});
  }, [muted]);
}
