import type { Locale } from './i18n/locale';
import type messages from './messages/bn.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
