'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/components/providers';
import { ApiError, unwrap } from '@/lib/api';
import type { RoomStore } from './room-store';

const INTERVAL_MS = 30_000;
/** The API allows 6 syncs per attempt per minute; keep well under it. */
const MIN_GAP_MS = 10_000;
const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

export interface SyncState {
  online: boolean;
  /** Last attempt failed (network or 5xx); retrying. */
  failing: boolean;
  /** 410 ATTEMPT_CLOSED: the server no longer accepts answers. */
  closed: boolean;
}

function body(store: RoomStore) {
  const s = store.getState();
  return {
    answers: s.answers,
    marked_for_review: s.marked,
    focus_loss_count: s.focusLoss,
    client_time: new Date().toISOString(),
  };
}

/**
 * FR-EXAM-07: the full answer map goes to PUT /attempts/{id}/answers every 30 s, when the tab is
 * hidden, when the connection comes back, and before submit. Failures retry with backoff; the
 * answers stay in IndexedDB meanwhile.
 */
export function useRoomSync(store: RoomStore, active: boolean) {
  const api = useApi();
  const [state, setState] = useState<SyncState>({ online: true, failing: false, closed: false });
  const lastRun = useRef(0);
  const attempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<boolean> | null>(null);

  const sync = useCallback(
    async (force = false): Promise<boolean> => {
      if (running.current) return running.current;
      const s = store.getState();
      if (!force && s.version <= s.syncedVersion) return true;
      if (!force && Date.now() - lastRun.current < MIN_GAP_MS) return false;
      const version = s.version;
      lastRun.current = Date.now();
      const run = (async () => {
        try {
          const res = await unwrap(
            api.PUT('/attempts/{id}/answers', {
              params: { path: { id: s.attemptId } },
              body: body(store),
            }),
          );
          if (res.server_time) store.getState().setOffset(res.server_time);
          store.getState().markSynced(version);
          attempt.current = 0;
          setState((p) => ({ ...p, failing: false, online: true }));
          return true;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'ATTEMPT_CLOSED') {
            setState((p) => ({ ...p, closed: true, failing: false }));
            return false;
          }
          const transient =
            !(e instanceof ApiError) || e.status === 0 || e.status >= 500 || e.status === 429;
          setState((p) => ({
            ...p,
            failing: transient,
            online: !(e instanceof ApiError && e.status === 0),
          }));
          if (transient) {
            const wait = BACKOFF_MS[Math.min(attempt.current, BACKOFF_MS.length - 1)]!;
            attempt.current += 1;
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(() => void sync(true), wait);
          }
          return false;
        } finally {
          running.current = null;
        }
      })();
      running.current = run;
      return run;
    },
    [api, store],
  );

  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => void sync(), INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void sync(true);
    };
    const onOnline = () => {
      setState((p) => ({ ...p, online: true }));
      void sync(true);
    };
    const onOffline = () => setState((p) => ({ ...p, online: false }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(tick);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [active, sync]);

  return { ...state, sync };
}

export { body as syncBody };
