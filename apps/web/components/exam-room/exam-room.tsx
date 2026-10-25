'use client';

import {
  AppButton,
  AppChip,
  ErrorState,
  SegmentedControl,
  Skeleton,
  TimerBar,
  cn,
  formatInteger,
} from '@mcq/ui';
import { ArrowLeft, ChevronLeft, ChevronRight, CloudOff, Flag, LayoutGrid, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useApi } from '@/components/providers';
import { useRouter } from '@/i18n/navigation';
import { ApiError, unwrap } from '@/lib/api';
import { useErrorText } from '@/lib/hooks';
import { buildRoomPaper, loadPaper } from '@/lib/exam/paper';
import { type RoomMode, getRoomStore, whenHydrated } from '@/lib/exam/room-store';
import { syncBody, useRoomSync } from '@/lib/exam/use-room-sync';
import { RoomNavigator, useCounts } from './room-navigator';
import { RoomQuestion } from './room-question';

const SUBMIT_BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 30_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function useSecondTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** D4 Exam room (FR-EXAM-05..10). Focus mode: no app shell. */
export function ExamRoom({ attemptId }: { attemptId: string }) {
  const t = useTranslations('room');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const errorText = useErrorText();
  const store = useMemo(() => getRoomStore(attemptId), [attemptId]);

  const status = useStore(store, (s) => s.status);
  const paper = useStore(store, (s) => s.paper);
  const mode = useStore(store, (s) => s.mode);
  const labels = useStore(store, (s) => s.labels);
  const current = useStore(store, (s) => s.current);
  const endsAt = useStore(store, (s) => s.endsAt);
  const offset = useStore(store, (s) => s.offset);
  const examId = useStore(store, (s) => s.examId);
  const syncedAt = useStore(store, (s) => s.syncedAt);
  const startedAt = useStore(store, (s) => s.startedAt);
  const currentMarked = useStore(store, (s) => s.marked.includes(s.paper?.order[s.current] ?? ''));
  const counts = useCounts(store);

  const [loadError, setLoadError] = useState<unknown>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [focusWarning, setFocusWarning] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);

  const running = status === 'running';
  const sync = useRoomSync(store, running);
  const now = useSecondTick(running);
  const remaining = endsAt ? Math.max(0, Math.floor((endsAt - (now + offset)) / 1000)) : 0;
  const totalSec = endsAt && startedAt ? Math.max(1, Math.round((endsAt - startedAt) / 1000)) : 1;

  const submittedUrl = useCallback(
    (exam: string | null) => ({
      pathname: `/room/${attemptId}/submitted`,
      query: exam ? { exam } : {},
    }),
    [attemptId],
  );

  // ---------------------------------------------------------------- load / resume
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await whenHydrated(store);
      const s = store.getState();
      if (s.status === 'submitted') {
        router.replace(submittedUrl(s.examId));
        return;
      }
      if (s.paper && (s.status === 'running' || s.status === 'submitting')) return;

      const exam = params.get('exam') ?? s.examId;
      if (!exam) throw new ApiError(404, 'NOT_FOUND', 'Exam not found');
      s.setStatus('loading');
      // POST start also resumes the attempt in progress (FR-EXAM-09).
      const start = await unwrap(
        api.POST('/exams/{id}/start', {
          params: { path: { id: exam } },
          body: { mode: params.get('mode') === 'practice' ? 'practice' : 'ranked' },
        }),
      );
      if (cancelled) return;
      if (start.attempt_id && start.attempt_id !== attemptId) {
        router.replace({ pathname: `/room/${start.attempt_id}`, query: { exam } });
        return;
      }
      const raw = await loadPaper(start, exam, () =>
        unwrap(api.GET('/exams/{id}/paper', { params: { path: { id: exam } } })),
      );
      if (cancelled) return;
      const defaultMode: RoomMode = window.matchMedia('(min-width: 1024px)').matches
        ? 'omr'
        : 'one';
      store.getState().init({
        start,
        examId: exam,
        paper: buildRoomPaper(raw, start),
        mode: defaultMode,
        labels:
          params.get('labels') === 'en' || (params.get('labels') !== 'bn' && locale === 'en')
            ? 'en'
            : 'bn',
      });
    })().catch((e: unknown) => {
      if (cancelled) return;
      if (e instanceof ApiError && e.code === 'ATTEMPT_CLOSED') {
        store.getState().setStatus('submitted');
        router.replace(submittedUrl(params.get('exam')));
        return;
      }
      store.getState().setStatus('idle');
      setLoadError(e);
    });
    return () => {
      cancelled = true;
    };
    // Runs once per attempt; params and locale are read at start only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // ---------------------------------------------------------------- submit
  const submit = useCallback(
    async (auto: boolean) => {
      if (submitting.current) return;
      submitting.current = true;
      setConfirmSubmit(false);
      setSheetOpen(false);
      setSubmitError(null);
      if (auto) setTimeUp(true);
      const s = store.getState();
      s.setStatus('submitting');
      for (let attempt = 0; ; attempt++) {
        try {
          await unwrap(
            api.POST('/attempts/{id}/submit', {
              params: { path: { id: attemptId } },
              body: syncBody(store),
            }),
          );
          break;
        } catch (e) {
          // Closed = the server already has the final answers (auto-submit at the deadline).
          if (e instanceof ApiError && e.code === 'ATTEMPT_CLOSED') break;
          const transient =
            !(e instanceof ApiError) || e.status === 0 || e.status >= 500 || e.status === 429;
          if (!transient) {
            submitting.current = false;
            setTimeUp(false);
            store.getState().setStatus('running');
            setSubmitError(e);
            return;
          }
          await sleep(SUBMIT_BACKOFF_MS[Math.min(attempt, SUBMIT_BACKOFF_MS.length - 1)]!);
        }
      }
      store.getState().setStatus('submitted');
      router.replace(submittedUrl(store.getState().examId));
    },
    [api, attemptId, router, store, submittedUrl],
  );

  // A reload while submitting finishes the submit.
  useEffect(() => {
    if (!(status === 'submitting' && paper && !submitting.current)) return;
    const id = setTimeout(() => void submit(false), 0);
    return () => clearTimeout(id);
  }, [status, paper, submit]);

  // Auto-submit at 00:00 (FR-EXAM-08), or once the server stops accepting answers.
  useEffect(() => {
    if (!(running && endsAt && (remaining <= 0 || sync.closed))) return;
    const id = setTimeout(() => void submit(true), 0);
    return () => clearTimeout(id);
  }, [running, endsAt, remaining, sync.closed, submit]);

  // ---------------------------------------------------------------- guards
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') store.getState().addFocusLoss();
      else setFocusWarning(true);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running, store]);

  useEffect(() => {
    if (!focusWarning) return;
    const id = setTimeout(() => setFocusWarning(false), 6000);
    return () => clearTimeout(id);
  }, [focusWarning]);

  // ---------------------------------------------------------------- navigation
  const jump = useCallback(
    (index: number) => {
      const s = store.getState();
      s.go(index);
      setSheetOpen(false);
      if (s.mode === 'omr') {
        document
          .getElementById(`q-${index}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [store],
  );

  // Keyboard: 1–5 option, ←/→ question, M mark (docs/06 D4).
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (target?.closest('input, textarea, select, dialog[open]')) return;
      const s = store.getState();
      const qid = s.paper?.order[s.current];
      if (!qid) return;
      if (/^[1-5]$/.test(e.key)) {
        const option = s.paper?.questions[qid]?.options[Number(e.key) - 1];
        if (option) s.select(qid, option.key);
      } else if (e.key === 'ArrowRight') jump(s.current + 1);
      else if (e.key === 'ArrowLeft') jump(s.current - 1);
      else if (e.key === 'm' || e.key === 'M') s.toggleMark(qid);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, store, jump]);

  useEffect(() => {
    const d = sheetRef.current;
    if (!d) return;
    if (sheetOpen && !d.open) d.showModal();
    if (!sheetOpen && d.open) d.close();
  }, [sheetOpen]);

  // ---------------------------------------------------------------- render
  if (loadError) {
    return (
      <div className="mx-auto max-w-reading px-4 py-16">
        <ErrorState
          message={errorText(loadError)}
          retryLabel={tc('retry')}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }
  if (!paper || status === 'idle' || status === 'loading') {
    return (
      <div
        aria-busy
        className="mx-auto flex max-w-reading flex-col gap-4 px-4 py-6"
        data-testid="room-loading"
      >
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-md" />
        ))}
      </div>
    );
  }

  const n = (v: number) => formatInteger(v, locale);
  const answeredChip = t('answeredChip', { answered: n(counts.answered), total: n(counts.total) });
  const syncedAgo = syncedAt ? Math.max(0, Math.round((now - syncedAt) / 1000)) : null;
  const offline = !sync.online || sync.failing;

  return (
    <div
      data-testid="exam-room"
      className="min-h-dvh select-none bg-bg"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <TimerBar
        remainingSec={remaining}
        totalSec={totalSec}
        label={t('timeLeft')}
        locale={locale}
        trailing={
          <>
            <AppChip data-testid="answered-count">{answeredChip}</AppChip>
            <button
              type="button"
              aria-label={t('leave')}
              onClick={() => setConfirmLeave(true)}
              className="grid size-10 place-items-center rounded-md border border-border text-text-muted hover:text-text"
            >
              <ArrowLeft aria-hidden size={20} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-label={t('openNavigator')}
              onClick={() => setSheetOpen(true)}
              className="grid size-10 place-items-center rounded-md border border-border text-text-muted hover:text-text lg:hidden"
            >
              <LayoutGrid aria-hidden size={20} strokeWidth={1.75} />
            </button>
          </>
        }
      />

      {offline && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-body-sm text-warning"
        >
          <CloudOff aria-hidden size={16} />
          {t('offline')}
        </div>
      )}
      {focusWarning && (
        <div
          role="alert"
          className="flex items-center justify-center gap-2 bg-danger-soft px-4 py-2 text-body-sm text-danger"
        >
          {t('focusWarning')}
          <button type="button" aria-label={tc('close')} onClick={() => setFocusWarning(false)}>
            <X aria-hidden size={16} />
          </button>
        </div>
      )}

      <div className="mx-auto flex max-w-[1048px] gap-6 px-4 pt-4 pb-28 lg:pb-10">
        <main className="flex min-w-0 max-w-reading flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              label={t('modeLabel')}
              value={mode}
              onValueChange={(m) => store.getState().setMode(m)}
              options={[
                { value: 'one', label: t('modeOne') },
                { value: 'omr', label: t('modeOmr') },
              ]}
            />
            <SegmentedControl
              label={t('labelsLabel')}
              value={labels}
              onValueChange={(l) => store.getState().setLabels(l)}
              options={[
                { value: 'bn', label: 'ক খ গ' },
                { value: 'en', label: 'A B C' },
              ]}
            />
          </div>

          {mode === 'one' ? (
            <div className="rounded-lg border border-border bg-surface p-4">
              <RoomQuestion store={store} questionId={paper.order[current]!} index={current} />
            </div>
          ) : (
            <>
              {paper.sections.length > 1 && (
                <nav
                  aria-label={t('sections')}
                  className="sticky top-[73px] z-(--mcq-z-sticky) -mx-4 flex gap-2 overflow-x-auto bg-bg px-4 py-2"
                >
                  {paper.sections.map((s, si) => (
                    <button
                      key={s.nodeId + si}
                      type="button"
                      onClick={() => jump(paper.order.indexOf(s.questionIds[0] ?? ''))}
                      className="whitespace-nowrap rounded-pill border border-border bg-surface px-3 py-1.5 text-caption font-medium text-text-muted hover:text-text"
                    >
                      {s.label || t('sectionN', { n: n(si + 1) })}
                    </button>
                  ))}
                </nav>
              )}
              {paper.order.map((id, i) => {
                const section = paper.questions[id]?.section ?? 0;
                const first = paper.sections[section]?.questionIds[0] === id;
                return (
                  <div key={id} className="flex flex-col gap-2">
                    {first && paper.sections[section]?.label && (
                      <h2 className="pt-2 text-h3 font-semibold text-text">
                        {paper.sections[section]?.label}
                      </h2>
                    )}
                    <div
                      className={cn(
                        'scroll-mt-32 rounded-lg border bg-surface p-4',
                        i === current ? 'border-border-strong' : 'border-border',
                      )}
                    >
                      <RoomQuestion store={store} questionId={id} index={i} id={`q-${i}`} />
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <p className="text-center text-caption text-text-muted" aria-live="polite">
            {offline
              ? t('savedLocally')
              : syncedAgo !== null
                ? t('syncedAgo', { sec: n(syncedAgo) })
                : t('savedLocally')}
          </p>
          {submitError !== null && (
            <p
              role="alert"
              className="rounded-md bg-danger-soft px-4 py-3 text-body-sm text-danger"
            >
              {errorText(submitError)}
            </p>
          )}
        </main>

        <aside className="sticky top-[88px] hidden h-fit w-70 flex-none rounded-lg border border-border bg-surface p-4 lg:block">
          <RoomNavigator store={store} onJump={jump} onSubmit={() => setConfirmSubmit(true)} />
        </aside>
      </div>

      {mode === 'one' && (
        <div className="fixed inset-x-0 bottom-0 z-(--mcq-z-sticky) border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:left-auto lg:right-auto lg:w-full">
          <div className="mx-auto flex max-w-[1048px] gap-2 px-4 py-3">
            <AppButton
              variant="secondary"
              size="sm"
              fullWidth
              disabled={current === 0}
              onClick={() => jump(current - 1)}
            >
              <ChevronLeft aria-hidden size={18} />
              {t('prev')}
            </AppButton>
            <AppButton
              variant="secondary"
              size="sm"
              fullWidth
              aria-pressed={currentMarked}
              onClick={() => store.getState().toggleMark(paper.order[current] ?? '')}
            >
              <Flag aria-hidden size={16} />
              {t('review')}
            </AppButton>
            {current < paper.order.length - 1 ? (
              <AppButton size="sm" fullWidth onClick={() => jump(current + 1)}>
                {t('next')}
                <ChevronRight aria-hidden size={18} />
              </AppButton>
            ) : (
              <AppButton size="sm" fullWidth onClick={() => setConfirmSubmit(true)}>
                {t('submit')}
              </AppButton>
            )}
          </div>
        </div>
      )}

      <dialog
        ref={sheetRef}
        onClose={() => setSheetOpen(false)}
        aria-label={t('questionList')}
        className="mt-auto mb-0 max-h-[80dvh] w-full max-w-none overflow-y-auto rounded-t-xl border-t border-border bg-surface p-4 pb-8 text-text backdrop:bg-overlay lg:hidden"
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-pill bg-border-strong" />
        <RoomNavigator store={store} onJump={jump} onSubmit={() => setConfirmSubmit(true)} />
      </dialog>

      <ConfirmDialog
        open={confirmSubmit}
        title={t('submitTitle')}
        body={t('submitBody', {
          answered: n(counts.answered),
          unanswered: n(counts.unanswered),
          marked: n(counts.marked),
        })}
        confirmLabel={t('submit')}
        cancelLabel={t('goBack')}
        loading={status === 'submitting'}
        onConfirm={() => void submit(false)}
        onClose={() => setConfirmSubmit(false)}
      />
      <ConfirmDialog
        open={confirmLeave}
        title={t('leaveTitle')}
        body={t('leaveBody')}
        confirmLabel={t('leave')}
        cancelLabel={t('stay')}
        onConfirm={async () => {
          await sync.sync(true);
          router.push(examId ? `/exams/${examId}` : '/exams');
        }}
        onClose={() => setConfirmLeave(false)}
      />

      {(timeUp || status === 'submitting') && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label={timeUp ? t('timeUp') : t('submitting')}
          className="fixed inset-0 z-(--mcq-z-modal) grid place-items-center bg-overlay px-6"
        >
          <div className="rounded-xl bg-surface px-6 py-8 text-center shadow-lg">
            <p className="text-h2 font-semibold text-text">
              {timeUp ? t('timeUp') : t('submitting')}
            </p>
            <p className="mt-2 text-body-sm text-text-muted">{t('submittingBody')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
