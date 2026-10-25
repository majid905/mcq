'use client';

import type { AttemptStart, OptionKey } from '@/lib/exam/paper';
import { buildRoomPaper } from '@/lib/exam/paper';
import { getRoomStore, whenHydrated } from '@/lib/exam/room-store';
import type { PracticeInput } from './queries';

/** What F3/F4 need besides the attempt: how to start the same practice again. */
export interface PracticeSession {
  start: AttemptStart;
  request: PracticeInput;
  title: string;
  /** question id → checked answer (filled as the user goes). */
  answers: Record<
    string,
    { option: OptionKey; correct: boolean; correctOption: OptionKey; explanation: string | null }
  >;
  index: number;
  startedAt: number;
  finishedAt: number | null;
}

const key = (attemptId: string) => `mcq-practice-${attemptId}`;

/** sessionStorage: survives a reload of the tab, not a new tab (the API has no session read). */
export function savePracticeSession(session: PracticeSession): void {
  try {
    sessionStorage.setItem(key(session.start.attempt_id ?? ''), JSON.stringify(session));
  } catch {
    // Storage full or blocked: the session still works until the tab is reloaded.
  }
}

export function loadPracticeSession(attemptId: string): PracticeSession | null {
  try {
    const raw = sessionStorage.getItem(key(attemptId));
    return raw ? (JSON.parse(raw) as PracticeSession) : null;
  } catch {
    return null;
  }
}

/** Custom exams (F5) and "take as exam" run in the exam room with the inline paper. */
export async function openInRoom(start: AttemptStart, labels: 'bn' | 'en'): Promise<string> {
  if (!start.paper || !start.attempt_id) throw new Error('practice start without an inline paper');
  const store = getRoomStore(start.attempt_id);
  await whenHydrated(store);
  store.getState().init({
    start,
    examId: null,
    paper: buildRoomPaper(start.paper, start),
    mode: window.matchMedia('(min-width: 1024px)').matches ? 'omr' : 'one',
    labels,
  });
  return start.attempt_id;
}
