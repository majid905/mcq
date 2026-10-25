/** Redis layout for a running attempt (docs/02 section 4). MySQL is only touched at start and by the worker. */
export const ATTEMPT_GRACE_SEC = 60;
/** FR-EXAM-04: a ranked attempt can start until end_at - 1 min. */
export const START_CUTOFF_SEC = 60;
export const ATTEMPT_TTL_SEC = 8 * 86_400;
export const SUBMIT_STREAM = 'q:submit';

export const metaKey = (id: bigint | string) => `att:${id}:meta`;
export const answersKey = (id: bigint | string) => `att:${id}:answers`;
export const extraKey = (id: bigint | string) => `att:${id}:extra`;
export const submitFlagKey = (id: bigint | string) => `att:${id}:submitted`;
export const startLockKey = (examId: bigint, userId: bigint) => `att:lock:${examId}:${userId}`;

/** `in_progress` until the user submits; `submitted` means the answers are queued for scoring. */
export interface AttemptMeta {
  user_id: string;
  exam_id: string | null;
  kind: 'live' | 'live_practice' | 'model' | 'previous_year' | 'custom' | 'quick_practice';
  started_ms: number;
  ends_ms: number;
  status: 'in_progress' | 'submitted';
  total: number;
}

export function metaToHash(m: AttemptMeta): Record<string, string> {
  return {
    user_id: m.user_id,
    exam_id: m.exam_id ?? '',
    kind: m.kind,
    started_ms: String(m.started_ms),
    ends_ms: String(m.ends_ms),
    status: m.status,
    total: String(m.total),
  };
}

export function metaFromHash(h: Record<string, string>): AttemptMeta | null {
  if (!h.user_id || !h.kind || !h.ends_ms) return null;
  return {
    user_id: h.user_id,
    exam_id: h.exam_id ? h.exam_id : null,
    kind: h.kind as AttemptMeta['kind'],
    started_ms: Number(h.started_ms),
    ends_ms: Number(h.ends_ms),
    status: h.status === 'submitted' ? 'submitted' : 'in_progress',
    total: Number(h.total),
  };
}

/** A ranked live attempt always ends at the exam's end_at; everything else gets the full duration. */
export function computeEndsAt(
  startedAt: Date,
  durationSec: number,
  kind: AttemptMeta['kind'],
  examEnd: Date | null,
): Date {
  const full = startedAt.getTime() + durationSec * 1000;
  return new Date(kind === 'live' && examEnd ? Math.min(full, examEnd.getTime()) : full);
}
