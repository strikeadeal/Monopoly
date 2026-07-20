import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityEntry, GameState } from '@monopoly/game';

const DISPLAY_MS = 4_000;
const MAX_PENDING = 4;

// Surfaces new money-toned activity entries one at a time. The first snapshot
// after mount or after any reconnect only seeds the seen set, so a returning
// player never gets the backlog replayed at them.
export function useMoneyAnnouncements(state: GameState, status: string) {
  const seenIds = useRef<Set<string> | null>(null);
  const suppressNext = useRef(false);
  const [queue, setQueue] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    if (status !== 'online') suppressNext.current = true;
  }, [status]);

  useEffect(() => {
    const activities = state.activities;
    if (seenIds.current === null || suppressNext.current) {
      seenIds.current = new Set(activities.map((entry) => entry.id));
      suppressNext.current = false;
      return;
    }
    const seen = seenIds.current;
    const fresh: ActivityEntry[] = [];
    for (let index = activities.length - 1; index >= 0; index -= 1) {
      const entry = activities[index]!;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (entry.tone === 'money') fresh.push(entry);
    }
    if (fresh.length) setQueue((pending) => [...pending, ...fresh].slice(-MAX_PENDING));
  }, [state.activities]);

  const banner = queue[0] ?? null;
  const bannerId = banner?.id ?? null;
  const dismiss = useCallback(() => setQueue((pending) => pending.slice(1)), []);

  useEffect(() => {
    if (!bannerId) return undefined;
    const timer = window.setTimeout(() => setQueue((pending) => pending.slice(1)), DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [bannerId]);

  return { banner, dismiss };
}
