'use client';

import { useEffect, useRef, useState } from 'react';
import type { WalkJob, Point } from './types';
import { getWalkSteps } from './board';
import { WALK_STEP_MS, WALK_MAX_MS } from './constants';

interface WalkPosition {
  xy: Point;
  /** Per-square transition time for THIS piece's walk — shorter for a long
   *  trip (a captured piece sent home from far away) so it never crawls. */
  stepMs: number;
}

interface Options {
  /** Real board coordinate for a player's pathPosition, or null if off-board. */
  resolveXY: (playerIndex: number, pathPos: number) => Point | null;
  /** Where a piece's home-base slot sits — the final hop for a captured piece. */
  homeBaseXY: (playerIndex: number, pieceIndex: number) => Point;
}

/**
 * Drives a piece marker box-by-box along its real path instead of gliding it
 * in a straight line — both forward (a normal move) and backward (captured,
 * walking back to its own start square before hopping into the home base).
 *
 * Returns the pieces currently mid-walk, keyed by id. A board should render
 * these at the given position INSTEAD of their authoritative one (which, for
 * a captured piece, is already "home" and would otherwise just make it
 * vanish rather than walk there) and skip them from normal rendering.
 */
export function useWalkAnimation(
  walkBatch: { id: number; jobs: WalkJob[] } | null,
  { resolveXY, homeBaseXY }: Options,
) {
  const [positions, setPositions] = useState<Map<string, WalkPosition>>(new Map());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Coordinate resolvers are recreated every render (they close over board
  // geometry), so reading them through a ref keeps the effect keyed on just
  // the batch itself, not on a new function identity every time.
  const optsRef = useRef({ resolveXY, homeBaseXY });
  useEffect(() => { optsRef.current = { resolveXY, homeBaseXY }; });

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!walkBatch || !walkBatch.jobs.length) return undefined;

    const { resolveXY: resolve, homeBaseXY: homeXY } = optsRef.current;
    const startedIds: string[] = [];

    walkBatch.jobs.forEach((job) => {
      const isCapture = job.toPath === -1;
      const steps = getWalkSteps(job.fromPath, job.toPath);
      const coords: Point[] = [];
      for (const p of steps) {
        const xy = resolve(job.playerIndex, p);
        if (xy) coords.push(xy);
      }
      if (isCapture) coords.push(homeXY(job.playerIndex, job.pieceIndex));
      if (!coords.length) return;

      const stepMs = Math.max(40, Math.min(WALK_STEP_MS, WALK_MAX_MS / coords.length));
      startedIds.push(job.pieceId);

      setPositions((prev) => {
        const next = new Map(prev);
        next.set(job.pieceId, { xy: coords[0], stepMs });
        return next;
      });

      coords.slice(1).forEach((xy, i) => {
        timers.current.push(setTimeout(() => {
          setPositions((prev) => {
            const next = new Map(prev);
            next.set(job.pieceId, { xy, stepMs });
            return next;
          });
        }, stepMs * (i + 1)));
      });

      timers.current.push(setTimeout(() => {
        setPositions((prev) => {
          if (!prev.has(job.pieceId)) return prev;
          const next = new Map(prev);
          next.delete(job.pieceId);
          return next;
        });
      }, stepMs * coords.length + 60));
    });

    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [walkBatch]);

  return positions;
}
