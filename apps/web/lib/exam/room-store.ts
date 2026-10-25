'use client';

import { del, get, set } from 'idb-keyval';
import { type StoreApi, createStore } from 'zustand';
import { type StateStorage, createJSONStorage, persist } from 'zustand/middleware';
import type { AttemptStart, OptionKey, RoomPaper } from './paper';

/** idle → loading → running → submitting → submitted (docs/02, exam room state machine). */
export type RoomStatus = 'idle' | 'loading' | 'running' | 'submitting' | 'submitted';
export type RoomMode = 'one' | 'omr';
export type LabelLang = 'bn' | 'en';

export interface RoomState {
  status: RoomStatus;
  attemptId: string;
  examId: string | null;
  kind: AttemptStart['kind'] | null;
  /** Deadline on the server clock, epoch ms. */
  endsAt: number;
  startedAt: number;
  /** serverNow - clientNow, ms. Timers use Date.now() + offset. */
  offset: number;
  paper: RoomPaper | null;
  answers: Record<string, OptionKey>;
  marked: string[];
  focusLoss: number;
  /** Index into paper.order. */
  current: number;
  mode: RoomMode;
  labels: LabelLang;
  /** Bumped on every answer/mark change; sync sends when it is ahead of syncedVersion. */
  version: number;
  syncedVersion: number;
  syncedAt: number | null;

  init: (input: {
    start: AttemptStart;
    examId: string | null;
    paper: RoomPaper;
    mode: RoomMode;
    labels: LabelLang;
  }) => void;
  setStatus: (status: RoomStatus) => void;
  select: (questionId: string, key: OptionKey) => void;
  toggleMark: (questionId: string) => void;
  go: (index: number) => void;
  setMode: (mode: RoomMode) => void;
  setLabels: (labels: LabelLang) => void;
  addFocusLoss: () => void;
  setOffset: (serverTime: string) => void;
  markSynced: (version: number) => void;
}

export type RoomStore = StoreApi<RoomState>;

/** IndexedDB via idb-keyval; falls back to memory when IndexedDB is unavailable. */
const memory = new Map<string, string>();
const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return ((await get<string>(name)) ?? null) as string | null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem: async (name, value) => {
    try {
      await set(name, value);
    } catch {
      memory.set(name, value);
    }
  },
  removeItem: async (name) => {
    try {
      await del(name);
    } catch {
      memory.delete(name);
    }
  },
};

export const roomStorageKey = (attemptId: string) => `mcq-room-${attemptId}`;

const stores = new Map<string, RoomStore>();

/** One persisted store per attempt; every change is written to IndexedDB. */
export function getRoomStore(attemptId: string): RoomStore {
  const existing = stores.get(attemptId);
  if (existing) return existing;
  const store = createStore<RoomState>()(
    persist(
      (setState, getState) => ({
        status: 'idle',
        attemptId,
        examId: null,
        kind: null,
        endsAt: 0,
        startedAt: 0,
        offset: 0,
        paper: null,
        answers: {},
        marked: [],
        focusLoss: 0,
        current: 0,
        mode: 'one',
        labels: 'bn',
        version: 0,
        syncedVersion: 0,
        syncedAt: null,

        init: ({ start, examId, paper, mode, labels }) => {
          const serverNow = Date.parse(start.server_time ?? '');
          const prev = getState();
          // Local answers win over saved_answers: they are never older than the last sync.
          const keepLocal = prev.paper !== null && prev.version > 0;
          setState({
            status: 'running',
            examId,
            kind: start.kind ?? null,
            endsAt: Date.parse(start.ends_at ?? ''),
            startedAt: Date.parse(start.started_at ?? ''),
            offset: Number.isFinite(serverNow) ? serverNow - Date.now() : 0,
            paper,
            answers: keepLocal
              ? prev.answers
              : ((start.saved_answers ?? {}) as Record<string, OptionKey>),
            marked: keepLocal ? prev.marked : [],
            current: keepLocal ? prev.current : 0,
            mode: keepLocal ? prev.mode : mode,
            labels: keepLocal ? prev.labels : labels,
          });
        },
        setStatus: (status) => setState({ status }),
        select: (questionId, key) => {
          const { answers, version, status } = getState();
          if (status !== 'running') return;
          const next = { ...answers };
          // Tapping the selected option again clears it (docs/06 D4).
          if (next[questionId] === key) delete next[questionId];
          else next[questionId] = key;
          setState({ answers: next, version: version + 1 });
        },
        toggleMark: (questionId) => {
          const { marked, version, status } = getState();
          if (status !== 'running') return;
          setState({
            marked: marked.includes(questionId)
              ? marked.filter((id) => id !== questionId)
              : [...marked, questionId],
            version: version + 1,
          });
        },
        go: (index) => {
          const total = getState().paper?.order.length ?? 0;
          setState({ current: Math.max(0, Math.min(total - 1, index)) });
        },
        setMode: (mode) => setState({ mode }),
        setLabels: (labels) => setState({ labels }),
        addFocusLoss: () =>
          setState((s) => ({ focusLoss: s.focusLoss + 1, version: s.version + 1 })),
        setOffset: (serverTime) => {
          const t = Date.parse(serverTime);
          if (Number.isFinite(t)) setState({ offset: t - Date.now() });
        },
        markSynced: (version) =>
          setState((s) => ({
            syncedVersion: Math.max(s.syncedVersion, version),
            syncedAt: Date.now(),
          })),
      }),
      {
        name: roomStorageKey(attemptId),
        storage: createJSONStorage(() => idbStorage),
        partialize: (s) => ({
          status: s.status,
          attemptId: s.attemptId,
          examId: s.examId,
          kind: s.kind,
          endsAt: s.endsAt,
          startedAt: s.startedAt,
          offset: s.offset,
          paper: s.paper,
          answers: s.answers,
          marked: s.marked,
          focusLoss: s.focusLoss,
          current: s.current,
          mode: s.mode,
          labels: s.labels,
          version: s.version,
          syncedVersion: s.syncedVersion,
          syncedAt: s.syncedAt,
        }),
      },
    ),
  );
  stores.set(attemptId, store);
  return store;
}

/** Resolves once the persisted state has been read from IndexedDB. */
export function whenHydrated(store: RoomStore): Promise<void> {
  const api = (
    store as RoomStore & {
      persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
    }
  ).persist;
  if (api.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = api.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}

/** Drops the local copy once the result is in (answers are on the server by then). */
export async function forgetRoom(attemptId: string): Promise<void> {
  stores.delete(attemptId);
  await idbStorage.removeItem(roomStorageKey(attemptId));
}
