import { Anek_Bangla, Hind_Siliguri, Inter } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

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
