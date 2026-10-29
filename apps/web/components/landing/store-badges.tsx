import { cn } from '@mcq/ui';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { site } from '@/lib/site';

/**
 * Display size per placement, from the prototype: hero 163×48 / 162×48, app panel 177×52 /
 * 176×52, footer 150×44 / 149×44 (official artwork 489×144 / 487×144).
 */
const SIZES = {
  sm: { h: 44, play: 150, apple: 149, radius: 'rounded-sm' },
  md: { h: 48, play: 163, apple: 162, radius: 'rounded-[9px]' },
  lg: { h: 52, play: 177, apple: 176, radius: 'rounded-[10px]' },
} as const;

/** Until the apps are listed, the badges open the store home pages (as the prototype does). */
const PLAY_FALLBACK = 'https://play.google.com/store';
const APPLE_FALLBACK = 'https://apps.apple.com/';

export async function StoreBadges({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const t = await getTranslations('landing.store');
  const s = SIZES[size];
  const badges = [
    {
      href: site.playStoreUrl ?? PLAY_FALLBACK,
      src: '/badges/google-play.png',
      alt: t('play'),
      w: s.play,
    },
    {
      href: site.appStoreUrl ?? APPLE_FALLBACK,
      src: '/badges/app-store.png',
      alt: t('appStore'),
      w: s.apple,
    },
  ];

  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {badges.map((b) => (
        <a
          key={b.src}
          href={b.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={b.alt}
          className={cn('landing-badge block flex-none', s.radius)}
          style={{ width: b.w, height: s.h }}
        >
          <Image src={b.src} alt={b.alt} width={b.w} height={s.h} className="block" />
        </a>
      ))}
    </div>
  );
}
