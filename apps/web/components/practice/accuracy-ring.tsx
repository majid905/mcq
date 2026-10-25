import { formatDecimal } from '@mcq/ui';
import { useLocale, useTranslations } from 'next-intl';

/** 44 px progress ring for subject cards: accuracy %, or a dash before any attempt. */
export function AccuracyRing({ pct }: { pct: number | null }) {
  const t = useTranslations('practice');
  const locale = useLocale();
  const size = 44;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div
      role="img"
      aria-label={
        pct === null ? t('notStarted') : t('accuracy', { pct: formatDecimal(value, locale, 0) })
      }
      className="relative grid size-11 flex-none place-items-center"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-muted"
        />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
            className="stroke-primary"
          />
        )}
      </svg>
      <span aria-hidden className="absolute text-overline font-semibold tabular-nums text-text">
        {pct === null ? '–' : `${formatDecimal(value, locale, 0)}%`}
      </span>
    </div>
  );
}
