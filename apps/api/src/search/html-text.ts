/** Plain text of question HTML for the search index: tags removed, entities decoded, spaces folded. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Marker characters a search engine wraps around matches; they never occur in real text. */
export const MARK_OPEN = '\u0001';
export const MARK_CLOSE = '\u0002';

/** Escapes the text, then turns the markers into <mark> tags: the result is safe to render as HTML. */
export function markersToHtml(text: string): string {
  return escapeHtml(text).split(MARK_OPEN).join('<mark>').split(MARK_CLOSE).join('</mark>');
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive highlight of `terms` in plain `text` (used by the MySQL fallback). */
export function highlightTerms(text: string, terms: string[]): string {
  const cleaned = terms.filter((t) => t.length > 0);
  if (cleaned.length === 0) return escapeHtml(text);
  const re = new RegExp(cleaned.map(escapeRegExp).join('|'), 'giu');
  return markersToHtml(text.replace(re, (m) => `${MARK_OPEN}${m}${MARK_CLOSE}`));
}

/** A window of about `size` characters around the first match, so long bodies stay short. */
export function snippet(text: string, terms: string[], size = 220): string {
  if (text.length <= size) return text;
  const lower = text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t.toLowerCase())).filter((i) => i >= 0);
  const first = at.length > 0 ? Math.min(...at) : 0;
  const start = Math.max(0, first - Math.floor(size / 4));
  const cut = text.slice(start, start + size);
  return `${start > 0 ? '…' : ''}${cut}${start + size < text.length ? '…' : ''}`;
}
