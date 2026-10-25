'use client';

import { Crown, Flame, LayoutGrid } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { AppButton } from '../components/app-button';
import { AppCard } from '../components/app-card';
import { AppChip } from '../components/app-chip';
import { AppTextField } from '../components/app-text-field';
import { EmptyState } from '../components/empty-state';
import { ErrorState } from '../components/error-state';
import { OPTION_LABELS, OptionTile, type OptionTileState } from '../components/option-tile';
import {
  type NavigatorItem,
  QuestionNavigator,
  type QuestionNavigatorLabels,
} from '../components/question-navigator';
import { Skeleton } from '../components/skeleton';
import { TimerBar } from '../components/timer-bar';
import { fillTemplate, formatInteger } from '../lib/format';

/** Shape of the `gallery` namespace in apps/web and apps/admin messages. */
export interface GalleryMessages {
  title: string;
  subtitle: string;
  light: string;
  dark: string;
  sections: Record<
    | 'buttons'
    | 'textField'
    | 'options'
    | 'cards'
    | 'chips'
    | 'skeleton'
    | 'empty'
    | 'error'
    | 'timer'
    | 'navigator',
    string
  >;
  button: Record<'primary' | 'secondary' | 'ghost' | 'danger' | 'small', string>;
  textField: Record<'label' | 'placeholder' | 'helper' | 'errorLabel' | 'error', string>;
  option: Record<
    'question' | 'a' | 'b' | 'c' | 'd' | 'correct' | 'wrong' | 'missed' | 'states',
    string
  >;
  card: Record<
    'liveTitle' | 'liveMeta' | 'upcomingTitle' | 'upcomingMeta' | 'join' | 'details',
    string
  >;
  chip: Record<'live' | 'streak' | 'premium' | 'category' | 'correct' | 'wrong', string>;
  empty: Record<'title' | 'description' | 'action', string>;
  error: Record<'message' | 'retry' | 'offline', string>;
  timer: Record<'label' | 'answered' | 'openNavigator', string>;
  navigator: QuestionNavigatorLabels;
}

export interface ComponentGalleryProps {
  messages: GalleryMessages;
  locale: string;
  /** Header controls from the app (theme toggle, language switch). */
  toolbar?: ReactNode;
}

const NAV_ITEMS: NavigatorItem[] = Array.from({ length: 24 }, (_, i) => ({
  number: i + 1,
  status: [3, 9, 17].includes(i + 1)
    ? 'marked'
    : i + 1 < 15 && i + 1 !== 6
      ? 'answered'
      : 'unanswered',
}));

function Section({
  title,
  messages,
  children,
}: {
  title: string;
  messages: GalleryMessages;
  children: () => ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-h2 font-semibold text-text">{title}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['light', 'dark'] as const).map((theme) => (
          <div
            key={theme}
            data-theme={theme}
            data-testid={`gallery-panel-${theme}`}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg p-4 text-text"
          >
            <span className="text-overline font-semibold uppercase tracking-wide text-text-muted">
              {messages[theme]}
            </span>
            {children()}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Every UI kit component in light and dark, in the active locale. Mounted at /dev/gallery. */
export function ComponentGallery({ messages: m, locale, toolbar }: ComponentGalleryProps) {
  const [selected, setSelected] = useState<number | null>(1);
  const [current, setCurrent] = useState(8);
  const [name, setName] = useState('');
  const [retrying, setRetrying] = useState(false);
  const labels = locale === 'bn' ? OPTION_LABELS.bn : OPTION_LABELS.en;
  const options = [m.option.a, m.option.b, m.option.c, m.option.d];
  const answered = NAV_ITEMS.filter((i) => i.status === 'answered').length;
  const answeredChip = fillTemplate(m.timer.answered, {
    answered: formatInteger(answered, locale),
    total: formatInteger(NAV_ITEMS.length, locale),
  });
  const reviewStates: OptionTileState[] = ['idle', 'correct', 'wrong', 'missed'];
  const statusLabel: Partial<Record<OptionTileState, string>> = {
    correct: m.option.correct,
    wrong: m.option.wrong,
    missed: m.option.missed,
  };

  return (
    <div className="mx-auto flex max-w-content flex-col gap-10 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text">{m.title}</h1>
          <p className="mt-1 text-body-sm text-text-muted">{m.subtitle}</p>
        </div>
        {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
      </header>

      <Section title={m.sections.buttons} messages={m}>
        {() => (
          <>
            <div className="flex flex-wrap gap-3">
              <AppButton>{m.button.primary}</AppButton>
              <AppButton variant="secondary">{m.button.secondary}</AppButton>
              <AppButton variant="ghost">{m.button.ghost}</AppButton>
              <AppButton variant="danger">{m.button.danger}</AppButton>
            </div>
            <div className="flex flex-wrap gap-3">
              <AppButton size="sm">{m.button.small}</AppButton>
              <AppButton size="sm" variant="secondary">
                {m.button.small}
              </AppButton>
              <AppButton size="sm" loading>
                {m.button.primary}
              </AppButton>
              <AppButton size="sm" disabled>
                {m.button.primary}
              </AppButton>
            </div>
            <AppButton fullWidth>{m.button.primary}</AppButton>
          </>
        )}
      </Section>

      <Section title={m.sections.textField} messages={m}>
        {() => (
          <>
            <AppTextField
              label={m.textField.label}
              placeholder={m.textField.placeholder}
              helperText={m.textField.helper}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <AppTextField
              label={m.textField.errorLabel}
              defaultValue="01712"
              inputMode="tel"
              error={m.textField.error}
            />
          </>
        )}
      </Section>

      <Section title={m.sections.options} messages={m}>
        {() => (
          <>
            <p className="text-question font-medium text-text">{m.option.question}</p>
            <div role="radiogroup" aria-label={m.option.question} className="flex flex-col gap-2">
              {options.map((text, i) => (
                <OptionTile
                  key={text}
                  label={labels[i]!}
                  state={selected === i ? 'selected' : 'idle'}
                  onSelect={() => setSelected(i)}
                >
                  {text}
                </OptionTile>
              ))}
            </div>
            <span className="text-caption text-text-muted">{m.option.states}</span>
            <div className="flex flex-col gap-2">
              {reviewStates.map((state, i) => (
                <OptionTile
                  key={state}
                  label={labels[i]!}
                  state={state}
                  statusLabel={statusLabel[state]}
                >
                  {options[i]}
                </OptionTile>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title={m.sections.cards} messages={m}>
        {() => (
          <>
            <AppCard live>
              <div className="flex items-center justify-between gap-2">
                <AppChip variant="live">{m.chip.live}</AppChip>
                <AppChip>{m.chip.category}</AppChip>
              </div>
              <h3 className="mt-2 text-h3 font-semibold">{m.card.liveTitle}</h3>
              <p className="mt-1 text-body-sm text-text-muted">{m.card.liveMeta}</p>
              <AppButton fullWidth className="mt-3">
                {m.card.join}
              </AppButton>
            </AppCard>
            <AppCard interactive>
              <h3 className="text-h3 font-semibold">{m.card.upcomingTitle}</h3>
              <p className="mt-1 text-body-sm text-text-muted">{m.card.upcomingMeta}</p>
              <AppButton variant="secondary" size="sm" className="mt-3">
                {m.card.details}
              </AppButton>
            </AppCard>
          </>
        )}
      </Section>

      <Section title={m.sections.chips} messages={m}>
        {() => (
          <div className="flex flex-wrap gap-2">
            <AppChip variant="live">{m.chip.live}</AppChip>
            <AppChip variant="accent" icon={<Flame aria-hidden size={14} />}>
              {m.chip.streak}
            </AppChip>
            <AppChip variant="primary" icon={<Crown aria-hidden size={14} />}>
              {m.chip.premium}
            </AppChip>
            <AppChip>{m.chip.category}</AppChip>
            <AppChip variant="success">✓ {m.chip.correct}</AppChip>
            <AppChip variant="danger">✕ {m.chip.wrong}</AppChip>
          </div>
        )}
      </Section>

      <Section title={m.sections.skeleton} messages={m}>
        {() => (
          <AppCard className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24 rounded-pill" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-13 w-full rounded-md" />
          </AppCard>
        )}
      </Section>

      <Section title={m.sections.empty} messages={m}>
        {() => (
          <AppCard>
            <EmptyState
              title={m.empty.title}
              description={m.empty.description}
              action={<AppButton size="sm">{m.empty.action}</AppButton>}
            />
          </AppCard>
        )}
      </Section>

      <Section title={m.sections.error} messages={m}>
        {() => (
          <div className="grid gap-3 sm:grid-cols-2">
            <AppCard>
              <ErrorState
                message={m.error.message}
                retryLabel={m.error.retry}
                retrying={retrying}
                onRetry={() => {
                  setRetrying(true);
                  setTimeout(() => setRetrying(false), 1200);
                }}
              />
            </AppCard>
            <AppCard>
              <ErrorState kind="offline" message={m.error.offline} />
            </AppCard>
          </div>
        )}
      </Section>

      <Section title={m.sections.timer} messages={m}>
        {() => (
          <div className="flex flex-col gap-3">
            {[2292, 292, 45].map((remaining) => (
              <div key={remaining} className="overflow-hidden rounded-md border border-border">
                <TimerBar
                  remainingSec={remaining}
                  totalSec={3600}
                  label={m.timer.label}
                  locale={locale}
                  className="static"
                  trailing={
                    <>
                      <AppChip>{answeredChip}</AppChip>
                      <button
                        type="button"
                        aria-label={m.timer.openNavigator}
                        className="grid size-10 place-items-center rounded-md border border-border text-text-muted"
                      >
                        <LayoutGrid aria-hidden size={20} strokeWidth={1.75} />
                      </button>
                    </>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={m.sections.navigator} messages={m}>
        {() => (
          <AppCard>
            <QuestionNavigator
              items={NAV_ITEMS}
              currentNumber={current}
              labels={m.navigator}
              locale={locale}
              onSelect={setCurrent}
            />
          </AppCard>
        )}
      </Section>
    </div>
  );
}
