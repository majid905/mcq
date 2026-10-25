'use client';

import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppChip,
  AppSwitch,
  AppTextField,
  SegmentedControl,
  Skeleton,
  cn,
  formatDecimal,
  formatInteger,
} from '@mcq/ui';
import type { components } from '@mcq/api-client-ts';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { useErrorText } from '@/lib/hooks';
import { type PracticeCreate, useTaxonomyChildren } from '@/lib/practice/queries';
import { useStartPractice } from './use-start-practice';

type Node = components['schemas']['TaxonomyNode'];
type Difficulty = NonNullable<PracticeCreate['difficulty']>;

function TreeLevel({
  parentId,
  depth,
  selected,
  onToggle,
}: {
  parentId: string | null;
  depth: number;
  selected: Map<string, string>;
  onToggle: (node: Node) => void;
}) {
  const locale = useLocale();
  const nodes = useTaxonomyChildren(parentId);
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (nodes.isPending)
    return <Skeleton className="my-1 h-10 rounded-md" style={{ marginLeft: depth * 20 }} />;
  if (!nodes.data) return null;
  return (
    <ul role={depth === 0 ? 'tree' : 'group'} className="flex flex-col">
      {nodes.data.map((n) => {
        const id = n.id ?? '';
        const expanded = open.has(id);
        return (
          <li
            key={id}
            role="treeitem"
            aria-expanded={n.has_children ? expanded : undefined}
            aria-selected={selected.has(id)}
          >
            <div className="flex min-h-11 items-center gap-1" style={{ paddingLeft: depth * 20 }}>
              {n.has_children ? (
                <button
                  type="button"
                  aria-label={(locale === 'bn' ? n.name_bn : n.name_en) ?? ''}
                  onClick={() =>
                    setOpen((s) => {
                      const next = new Set(s);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  className="grid size-8 place-items-center rounded-sm text-text-muted hover:bg-surface-muted"
                >
                  <ChevronRight
                    aria-hidden
                    size={16}
                    className={cn('transition-transform', expanded && 'rotate-90')}
                  />
                </button>
              ) : (
                <span className="size-8" />
              )}
              <AppCheckbox
                checked={selected.has(id)}
                onChange={() => onToggle(n)}
                label={
                  <span>
                    {(locale === 'bn' ? n.name_bn : n.name_en) ?? ''}{' '}
                    <span className="text-caption text-text-muted">
                      ({formatDecimal(n.question_count ?? 0, locale, 0)})
                    </span>
                  </span>
                }
              />
            </div>
            {expanded && (
              <TreeLevel parentId={id} depth={depth + 1} selected={selected} onToggle={onToggle} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** F5 Custom exam builder (FR-PRAC-03): topics, then settings, then the exam room. */
export function CustomBuilder() {
  const t = useTranslations('custom');
  const locale = useLocale();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const practice = useStartPractice();
  const countId = useId();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(50);
  const [timed, setTimed] = useState(true);
  const [minutes, setMinutes] = useState(50);
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [excludeSeen, setExcludeSeen] = useState(false);
  const n = (v: number) => formatInteger(v, locale);

  const toggle = (node: Node) =>
    setSelected((s) => {
      const next = new Map(s);
      if (next.has(node.id ?? '')) next.delete(node.id ?? '');
      else next.set(node.id ?? '', (locale === 'bn' ? node.name_bn : node.name_en) ?? '');
      return next;
    });

  // Search covers every taxonomy level already loaded (categories and opened branches).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Map<string, Node>();
    for (const [, nodes] of qc.getQueriesData<Node[]>({ queryKey: ['taxonomy'] })) {
      for (const node of nodes ?? []) seen.set(node.id ?? '', node);
    }
    return [...seen.values()]
      .filter(
        (node) =>
          (node.name_bn ?? '').includes(q) || (node.name_en ?? '').toLowerCase().includes(q),
      )
      .slice(0, 12);
    // Recomputed on each keystroke; the cache read is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, qc, selected]);

  const submit = () =>
    practice.start(
      {
        mode: 'custom',
        node_ids: [...selected.keys()],
        question_count: count,
        duration_sec: timed ? minutes * 60 : null,
        difficulty,
        exclude_seen: excludeSeen,
      },
      t('title'),
    );

  return (
    <div className="mx-auto flex max-w-reading flex-col gap-4">
      <div>
        <p className="text-caption font-semibold text-primary">
          {t('step', { current: step, total: 2 })}
        </p>
        <h1 className="mt-1 text-h1 font-bold text-text">{t('title')}</h1>
      </div>

      {step === 1 ? (
        <>
          <AppTextField
            label={t('search')}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leading={<Search aria-hidden size={18} />}
            placeholder={t('searchPlaceholder')}
          />
          {matches.length > 0 && (
            <AppCard className="flex flex-col gap-1">
              {matches.map((m) => (
                <AppCheckbox
                  key={m.id}
                  checked={selected.has(m.id ?? '')}
                  onChange={() => toggle(m)}
                  label={(locale === 'bn' ? m.name_bn : m.name_en) ?? ''}
                />
              ))}
            </AppCard>
          )}
          <AppCard>
            <TreeLevel parentId={null} depth={0} selected={selected} onToggle={toggle} />
          </AppCard>
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2" aria-label={t('selected')}>
              {[...selected].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setSelected((s) => {
                      const next = new Map(s);
                      next.delete(id);
                      return next;
                    })
                  }
                  aria-label={t('remove', { name: label })}
                >
                  <AppChip variant="primary" icon={<X aria-hidden size={12} />}>
                    {label}
                  </AppChip>
                </button>
              ))}
            </div>
          )}
          <AppButton fullWidth disabled={selected.size === 0} onClick={() => setStep(2)}>
            {t('next', { count: n(selected.size) })}
          </AppButton>
        </>
      ) : (
        <>
          <AppCard className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor={countId}
                className="flex items-center justify-between text-body text-text"
              >
                {t('count')}
                <span className="font-semibold tabular-nums">{n(count)}</span>
              </label>
              <input
                id={countId}
                type="range"
                min={10}
                max={200}
                step={5}
                value={count}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setCount(v);
                  setMinutes(v);
                }}
                className="w-full accent-primary"
              />
            </div>
            <AppSwitch
              label={t('timed')}
              description={timed ? undefined : t('untimed')}
              checked={timed}
              onCheckedChange={setTimed}
            />
            {timed && (
              <AppTextField
                label={t('minutes')}
                type="number"
                inputMode="numeric"
                min={5}
                max={300}
                value={minutes}
                onChange={(e) =>
                  setMinutes(Math.max(1, Math.min(300, Number(e.target.value) || 1)))
                }
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-body text-text">{t('difficulty')}</span>
              <SegmentedControl
                label={t('difficulty')}
                value={difficulty}
                onValueChange={setDifficulty}
                options={[
                  { value: 'easy', label: t('easy') },
                  { value: 'mixed', label: t('mixed') },
                  { value: 'hard', label: t('hard') },
                ]}
              />
            </div>
            <AppSwitch
              label={t('excludeSeen')}
              checked={excludeSeen}
              onCheckedChange={setExcludeSeen}
            />
          </AppCard>
          <p
            className="rounded-md bg-surface-muted px-4 py-3 text-body-sm text-text"
            data-testid="custom-summary"
          >
            {t('summary', {
              count: n(count),
              topics: n(selected.size),
              time: timed ? t('minutesShort', { m: n(minutes) }) : t('untimedShort'),
            })}
          </p>
          <FormError message={practice.error ? errorText(practice.error) : null} />
          <div className="flex gap-3">
            <AppButton variant="secondary" fullWidth onClick={() => setStep(1)}>
              {t('back')}
            </AppButton>
            <AppButton fullWidth loading={practice.isPending} onClick={submit}>
              {t('start')}
            </AppButton>
          </div>
        </>
      )}
    </div>
  );
}
