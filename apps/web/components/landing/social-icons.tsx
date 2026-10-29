import type { SocialNetwork } from '@/lib/site';

// Brand glyphs (not in Lucide), 24 px viewBox.
const PATHS: Record<Exclude<SocialNetwork, 'instagram'>, string> = {
  facebook:
    'M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21z',
  youtube:
    'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z',
  linkedin:
    'M6.9 8.6H3.6V20h3.3zM5.2 3.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM20.4 13.5c0-3.1-1.7-5.1-4.4-5.1-1.5 0-2.5.8-3 1.6V8.6H9.8V20h3.3v-5.9c0-1.5.6-2.6 2-2.6s1.9 1 1.9 2.6V20h3.4z',
};

export function SocialIcon({ network }: { network: SocialNetwork }) {
  if (network === 'instagram') {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
      <path d={PATHS[network]} />
    </svg>
  );
}

export const SOCIAL_NAMES: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
};
