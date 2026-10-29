import { cn } from '@mcq/ui';
import { getTranslations } from 'next-intl/server';
import { PAD_T, SectionHead, WRAP } from './layout';
import { Stars } from './stars';

interface Review {
  quote: string;
  name: string;
  district: string;
  exam: string;
}

/**
 * Two review tickers moving in opposite directions (CSS only, paused on hover). Each list is
 * rendered twice for a seamless loop; the copy is hidden from screen readers.
 */
export async function ReviewsMarquee() {
  const t = await getTranslations('landing.reviews');
  const items = t.raw('items') as Review[];
  const rows = [items.slice(0, 4), items.slice(4)];

  return (
    <section className={PAD_T}>
      <SectionHead
        eyebrow={t('eyebrow')}
        title={t('title')}
        className={cn(WRAP, 'mb-[clamp(24px,3vw,40px)]')}
      />
      <div className="flex flex-col gap-1">
        {rows.map((row, r) => (
          <div key={r} className="landing-fade-x overflow-hidden">
            <ul
              className={cn(
                'flex w-max gap-4 pt-1.5 pb-[18px]',
                r === 0 ? 'landing-marquee' : 'landing-marquee-reverse',
              )}
            >
              {[...row, ...row].map((review, i) => (
                <li
                  key={i}
                  aria-hidden={i >= row.length ? true : undefined}
                  className="flex w-[clamp(280px,30vw,360px)] flex-none"
                >
                  <figure className="flex flex-1 flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-[22px] shadow-[0_14px_30px_-22px_var(--brand-shc)]">
                    <Stars className="size-4" />
                    <blockquote className="text-[17px] leading-[1.65] text-pretty">
                      “{review.quote}”
                    </blockquote>
                    <figcaption className="mt-auto flex items-center gap-3">
                      <span className="grid size-10 flex-none place-items-center rounded-pill bg-primary-soft text-[16px] font-semibold text-(--brand-pri)">
                        {Array.from(review.name)[0]}
                      </span>
                      <span className="flex min-w-0 flex-col leading-[1.35]">
                        <strong className="text-[15px] font-semibold">{review.name}</strong>
                        <span className="text-[14px] text-text-subtle">
                          {review.district} · {review.exam}
                        </span>
                      </span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
