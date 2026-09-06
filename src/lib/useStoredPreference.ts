'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A small string preference persisted in localStorage (remembered name, mute
 * setting), read after mount.
 *
 * It has to be read in an effect rather than a lazy useState initialiser:
 * localStorage doesn't exist while the page is server-rendered, so reading it
 * during the first client render would produce a different tree than the
 * server sent and break hydration. Starting from the fallback and filling in
 * afterwards is the SSR-safe order.
 *
 * This is the one place that exception lives, so the rule is disabled once
 * here rather than at every call site.
 */
export function useStoredPreference(
  key: string,
  fallback = '',
): [string, (value: string) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above: localStorage is unavailable during SSR, so this must run post-mount.
      if (stored !== null) setValue(stored);
    } catch { /* storage blocked (private mode, disabled cookies) — keep fallback */ }
  }, [key]);

  const update = useCallback((next: string) => {
    setValue(next);
    try { localStorage.setItem(key, next); } catch { /* ignore */ }
  }, [key]);

  return [value, update];
}
