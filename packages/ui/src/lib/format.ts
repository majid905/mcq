const formatters = new Map<string, Intl.NumberFormat>();

/** Integer in the locale's digits (০১২৩ for bn), padded to `minDigits`, no grouping. */
export function formatInteger(value: number, locale: string, minDigits = 1): string {
  const key = `${locale}:${minDigits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumIntegerDigits: minDigits, useGrouping: false });
    formatters.set(key, f);
  }
  return f.format(Math.trunc(value));
}

/** Remaining time as mm:ss, or h:mm:ss from one hour up, in the locale's digits. */
export function formatClock(totalSeconds: number, locale: string): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mmss = `${formatInteger(m, locale, 2)}:${formatInteger(sec, locale, 2)}`;
  return h > 0 ? `${formatInteger(h, locale)}:${mmss}` : mmss;
}

/** Replaces `{name}` placeholders. For component labels passed in from app messages. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/** Scores and marks: up to `maxFraction` decimals in the locale's digits (৪২.৫). */
export function formatDecimal(value: number, locale: string, maxFraction = 2): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFraction }).format(value);
}
