import { Anek_Bangla, DM_Sans, Hind_Siliguri, Inter, Plus_Jakarta_Sans } from 'next/font/google';

/** Latin text on the Bangla site (as in the design). */
export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

/** English site body text. Bangla falls through to Hind Siliguri. */
export const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm', display: 'swap' });

/** English site headings and big numbers. Bangla falls through to Anek Bangla. */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const hindSiliguri = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-hind',
  display: 'swap',
});

/** Display face (landing headings, big numbers, logo). Variable, with the width axis for the logo. */
export const anekBangla = Anek_Bangla({
  subsets: ['bengali', 'latin'],
  axes: ['wdth'],
  variable: '--font-anek',
  display: 'swap',
});
