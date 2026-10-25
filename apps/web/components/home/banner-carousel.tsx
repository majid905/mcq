'use client';

import { cn } from '@mcq/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import type { HomeFeed } from '@/lib/queries';

type Banner = NonNullable<HomeFeed['banners']>[number];

/** C1.4 Banners: 16:7, radius 16, auto-advance every 5 s (paused on hover/focus, off with reduced motion). */
export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const t = useTranslations('home');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [broken, setBroken] = useState<Record<string, true>>({});

  useEffect(() => {
    if (paused || banners.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(id);
  }, [paused, banners.length]);

  if (banners.length === 0) return null;
  const current = banners[Math.min(index, banners.length - 1)]!;
  const isExternal = current.deep_link && /^https?:/.test(current.deep_link);

  const slide = (
    <div className="relative aspect-[16/7] overflow-hidden rounded-lg bg-primary-soft">
      {current.image_url && !broken[current.id ?? ''] && (
        // eslint-disable-next-line @next/next/no-img-element -- CDN banners; sizes vary, no next/image loader yet
        <img
          src={current.image_url}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setBroken((b) => ({ ...b, [current.id ?? '']: true }))}
        />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-overlay to-transparent p-4 text-h3 font-semibold text-on-primary">
        {current.title}
      </span>
    </div>
  );

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t('banners')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="flex flex-col gap-2"
    >
      {current.deep_link && !isExternal ? (
        <Link
          href={current.deep_link}
          className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {slide}
        </Link>
      ) : (
        slide
      )}
      {banners.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id ?? i}
              type="button"
              aria-label={t('bannerN', { n: i + 1 })}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className="grid size-6 place-items-center"
            >
              <span
                className={cn(
                  'h-1.5 rounded-pill transition-all',
                  i === index ? 'w-5 bg-primary' : 'w-1.5 bg-border-strong',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
