'use client';

import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { type PracticeInput, useCreatePractice } from '@/lib/practice/queries';
import { openInRoom, savePracticeSession } from '@/lib/practice/session';

/**
 * Quick practice (and bookmarks / wrong lists) runs in the one-at-a-time screen (F3) with
 * instant answers; a custom exam runs in the exam room (F5 → D4).
 */
export function useStartPractice() {
  const create = useCreatePractice();
  const router = useRouter();
  const locale = useLocale();

  const start = (request: PracticeInput, title: string) =>
    create.mutate(request, {
      onSuccess: async (s) => {
        if (request.mode === 'custom') {
          const id = await openInRoom(s, locale === 'en' ? 'en' : 'bn');
          router.push(`/room/${id}`);
          return;
        }
        savePracticeSession({
          start: s,
          request,
          title,
          answers: {},
          index: 0,
          startedAt: Date.now(),
          finishedAt: null,
        });
        router.push(`/practice/session/${s.attempt_id}`);
      },
    });

  return { start, isPending: create.isPending, error: create.error, reset: create.reset };
}
