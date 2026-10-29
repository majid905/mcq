import { Avatar } from '@mcq/ui';
import { getTranslations } from 'next-intl/server';
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
    <section className="pt-14 md:pt-20 lg:pt-28">
      <div className="mx-auto mb-6 flex max-w-(--breakpoint-xl) flex-col items-center gap-3 px-4 text-center md:mb-10 md:px-8 xl:px-14">
        <span className="text-body font-semibold text-primary">{t('eyebrow')}</span>
        <h2 className="font-display text-section-title-sm font-semibold text-balance text-text md:text-section-title">
          {t('title')}
        </h2>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((row, r) => (
          <div key={r} className="landing-fade-x overflow-hidden">
            <ul
              className={`flex w-max gap-4 pt-1.5 pb-4.5 ${r === 0 ? 'landing-marquee' : 'landing-marquee-reverse'}`}
            >
              {[...row, ...row].map((review, i) => (
                <li
                  key={i}
                  aria-hidden={i >= row.length ? true : undefined}
                  className="flex w-[clamp(17.5rem,30vw,22.5rem)] flex-none flex-col gap-3.5 rounded-xl border border-border bg-surface p-5.5 shadow-md"
                >
                  <figure className="flex flex-1 flex-col gap-3.5">
                    <Stars className="size-4" />
                    <blockquote className="text-question text-pretty text-text">
                      “{review.quote}”
                    </blockquote>
                    <figcaption className="mt-auto flex items-center gap-3">
                      <Avatar name={review.name} className="size-10 text-body" />
                      <span className="flex min-w-0 flex-col">
                        <strong className="text-body font-semibold">{review.name}</strong>
                        <span className="text-body-sm text-text-subtle">
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
