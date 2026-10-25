'use client';

import { AppButton, AppCard, ErrorState, SegmentedControl, Skeleton } from '@mcq/ui';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { useApi } from '@/components/providers';
import { Link, useRouter } from '@/i18n/navigation';
import { unwrap } from '@/lib/api';
import { buildRoomPaper, loadPaper } from '@/lib/exam/paper';
import { useExamDetail } from '@/lib/exam/queries';
import { type LabelLang, getRoomStore, whenHydrated } from '@/lib/exam/room-store';
import { useErrorText } from '@/lib/hooks';

const CHECKS = ['internet', 'autosave', 'autosubmit', 'focus'] as const;

/** D3 Pre-exam (FR-EXAM-04, 05): checklist, option labels, "আমি প্রস্তুত" → start. */
export function ExamInstructions({ id }: { id: string }) {
  const t = useTranslations('instructions');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const errorText = useErrorText();
  const detail = useExamDetail(id);
  const practice = params.get('mode') === 'practice';
  const [labels, setLabels] = useState<LabelLang>(locale === 'en' ? 'en' : 'bn');

  const start = useMutation({
    mutationFn: async () => {
      const s = await unwrap(
        api.POST('/exams/{id}/start', {
          params: { path: { id } },
          body: { mode: practice ? 'practice' : 'ranked' },
        }),
      );
      const raw = await loadPaper(s, id, () =>
        unwrap(api.GET('/exams/{id}/paper', { params: { path: { id } } })),
      );
      const store = getRoomStore(s.attempt_id ?? '');
      // A resumed attempt may have newer answers in IndexedDB; init keeps those.
      await whenHydrated(store);
      store.getState().init({
        start: s,
        examId: id,
        paper: buildRoomPaper(raw, s),
        mode: window.matchMedia('(min-width: 1024px)').matches ? 'omr' : 'one',
        labels,
      });
      return s;
    },
    onSuccess: (s) =>
      router.push({
        pathname: `/room/${s.attempt_id}`,
        query: { exam: id, ...(practice ? { mode: 'practice' } : {}) },
      }),
  });

  if (detail.isPending) return <Skeleton aria-busy className="h-96 rounded-lg" />;
  if (detail.isError) {
    return (
      <ErrorState
        message={errorText(detail.error)}
        retryLabel={tc('retry')}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-5">
      <div>
        <p className="text-caption font-semibold text-primary">
          {practice ? t('practiceMode') : t('rankedMode')}
        </p>
        <h1 className="mt-1 text-h1 font-bold text-text">{detail.data.title}</h1>
      </div>
      <AppCard>
        <h2 className="text-h3 font-semibold text-text">{t('checklist')}</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {CHECKS.map((c) => (
            <li key={c} className="flex gap-3 text-body text-text">
              <CheckCircle2 aria-hidden size={20} className="mt-0.5 flex-none text-success" />
              {t(`checks.${c}`)}
            </li>
          ))}
        </ul>
      </AppCard>
      <AppCard className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-body text-text">{t('labels')}</span>
        <SegmentedControl
          label={t('labels')}
          value={labels}
          onValueChange={setLabels}
          options={[
            { value: 'bn', label: 'ক খ গ ঘ' },
            { value: 'en', label: 'A B C D' },
          ]}
        />
      </AppCard>
      <FormError message={start.isError ? errorText(start.error) : null} />
      <div className="flex gap-3">
        <AppButton asChild variant="secondary" fullWidth>
          <Link href={`/exams/${id}`}>{t('back')}</Link>
        </AppButton>
        <AppButton fullWidth loading={start.isPending} onClick={() => start.mutate()}>
          {t('ready')}
        </AppButton>
      </div>
    </div>
  );
}
