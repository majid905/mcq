import { cn } from '@mcq/ui';
import { Smartphone } from 'lucide-react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { site } from '@/lib/site';

// Official badge artwork, 489×144 / 487×144 px, shown at a fixed height (README "Assets").
const HEIGHT = { sm: 44, md: 48, lg: 52 } as const;

/**
 * Google Play and App Store badges. Hidden until the store URLs are configured; until then a
 * "coming soon" note keeps the slot (INTEGRATION-mcq.md "Data").
 */
export async function StoreBadges({
  size = 'md',
  tone = 'default',
  className,
}: {
  size?: keyof typeof HEIGHT;
  /** `inverse` on the dark app panel. */
  tone?: 'default' | 'inverse';
  className?: string;
}) {
  const t = await getTranslations('landing.store');
  const h = HEIGHT[size];
  const badges = [
    { href: site.playStoreUrl, src: '/badges/google-play.png', alt: t('play'), w: 489 },
    { href: site.appStoreUrl, src: '/badges/app-store.png', alt: t('appStore'), w: 487 },
  ].filter((b): b is typeof b & { href: string } => b.href !== null);

  if (badges.length === 0) {
    return (
      <p
        className={cn(
          'inline-flex items-center gap-2 self-start rounded-md border px-4 py-3 text-body-sm',
          tone === 'inverse' ? 'border-bg/25 text-bg' : 'border-border bg-surface text-text-muted',
          className,
        )}
      >
        <Smartphone aria-hidden size={18} strokeWidth={1.75} />
        {t('soon')}
      </p>
    );
  }

  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {badges.map((b) => (
        <a
          key={b.src}
          href={b.href}
          target="_blank"
          rel="noopener noreferrer"
          className="block flex-none rounded-sm transition-[transform,filter,box-shadow] duration-(--mcq-duration-slow) ease-standard motion-safe:hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110"
        >
          <Image
            src={b.src}
            alt={b.alt}
            width={Math.round((b.w / 144) * h)}
            height={h}
            className="block"
            style={{ height: h, width: 'auto' }}
          />
        </a>
      ))}
    </div>
  );
}
