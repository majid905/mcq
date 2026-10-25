import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Token font sizes and radii that are not Tailwind t-shirt sizes. Without this, tailwind-merge
// reads `text-question` as a colour and drops it next to `text-text`. Keep in sync with
// design/tokens.json (font.size, radius).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display',
        'h1',
        'h2',
        'h3',
        'body',
        'body-sm',
        'caption',
        'overline',
        'question',
        'option',
        'timer',
        'stat',
      ],
      radius: ['pill'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
