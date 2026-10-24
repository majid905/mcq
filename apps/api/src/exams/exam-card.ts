import type { exams } from '@prisma/client';

export type ExamCardStatus = 'upcoming' | 'open_soon' | 'running' | 'finished' | 'merit_published';

export interface ExamCardDto {
  id: string;
  type: 'live' | 'model' | 'previous_year';
  title: string;
  category: string;
  start_at: string | null;
  end_at: string | null;
  duration_sec: number;
  question_count: number;
  total_marks: number;
  participant_count: number;
  is_premium: boolean;
  status: ExamCardStatus;
  my_attempt: {
    attempt_id: string;
    status: 'in_progress' | 'submitted' | 'scored' | 'expired';
    score: number | null;
  } | null;
  has_reminder: boolean;
}

/** FR-HOME-01: the Join button opens 10 minutes before the start. */
export const OPEN_SOON_MS = 10 * 60_000;

/**
 * Status shown to clients. Draft and cancelled exams are never listed. For scheduled/running
 * exams the clock decides, so the card is right even before the scheduler flips the DB status.
 */
export function effectiveStatus(
  exam: Pick<exams, 'status' | 'start_at' | 'end_at'>,
  now: Date,
): ExamCardStatus | null {
  switch (exam.status) {
    case 'draft':
    case 'cancelled':
      return null;
    case 'merit_published':
      return 'merit_published';
    case 'ended':
      return 'finished';
    default: {
      if (!exam.start_at) return 'running'; // anytime exams (model / previous year)
      const start = exam.start_at.getTime();
      const end = exam.end_at?.getTime() ?? Infinity;
      if (now.getTime() >= end) return 'finished';
      if (now.getTime() >= start) return 'running';
      return start - now.getTime() <= OPEN_SOON_MS ? 'open_soon' : 'upcoming';
    }
  }
}

export interface CardContext {
  locale: 'bn' | 'en';
  categoryName: string;
  myAttempt: ExamCardDto['my_attempt'];
  hasReminder: boolean;
  now: Date;
}

export function toExamCard(exam: exams, ctx: CardContext): ExamCardDto | null {
  const status = effectiveStatus(exam, ctx.now);
  if (!status) return null;
  return {
    id: String(exam.id),
    type: exam.type,
    title: ctx.locale === 'en' ? exam.title_en : exam.title_bn,
    category: ctx.categoryName,
    start_at: exam.start_at?.toISOString() ?? null,
    end_at: exam.end_at?.toISOString() ?? null,
    duration_sec: exam.duration_sec,
    question_count: exam.question_count,
    total_marks: Number(exam.total_marks),
    participant_count: exam.participant_count,
    is_premium: exam.is_premium,
    status,
    my_attempt: ctx.myAttempt,
    has_reminder: ctx.hasReminder,
  };
}
