import DOMPurify from 'isomorphic-dompurify';
import katex from 'katex';

/**
 * Question, option and explanation HTML from the API: sanitized again here (defence in depth,
 * the API sanitizes on save), then math is rendered with KaTeX. Works on the server (SEO pages)
 * and in the browser.
 *
 * Math markup (written by the admin editor):
 *   <span class="math" data-latex="x^2">…</span>                      inline
 *   <div class="math" data-latex="\int_0^1 x\,dx" data-display="true">…</div>   block
 * Imported text may also use \( … \) and \[ … \].
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'sub',
  'sup',
  'span',
  'div',
  'img',
  'mark',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];
const ALLOWED_ATTR = [
  'class',
  'data-latex',
  'data-display',
  'src',
  'alt',
  'width',
  'height',
  'colspan',
  'rowspan',
];

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (e) => ENTITIES[e] ?? e);

function tex(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
    strict: 'ignore',
  });
}

// Attribute values may hold raw < and > (HTML serialization does not escape them), so attributes
// are matched as "quoted value or any non-> character".
const MATH_NODE =
  /<(span|div)\b((?:[^>"]|"[^"]*")*\bclass="math"(?:[^>"]|"[^"]*")*)>[\s\S]*?<\/\1>/g;
const LATEX_ATTR = /\bdata-latex="([^"]*)"/;

const cache = new Map<string, string>();
const CACHE_MAX = 500;

export function renderRichHtml(html: string | null | undefined): string {
  if (!html) return '';
  const hit = cache.get(html);
  if (hit !== undefined) return hit;

  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
  const out = clean
    .replace(MATH_NODE, (match, _tag: string, attrs: string) => {
      const latex = LATEX_ATTR.exec(attrs)?.[1];
      if (latex === undefined) return match;
      return tex(decode(latex), /\bdata-display="true"/.test(attrs));
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, latex: string) => tex(decode(latex), true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, latex: string) => tex(decode(latex), false));

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(html, out);
  return out;
}

/** Plain text (for <title>, meta description and JSON-LD). */
export function richToText(html: string | null | undefined): string {
  if (!html) return '';
  const withLatex = html.replace(MATH_NODE, (_m, _t: string, attrs: string) =>
    decode(LATEX_ATTR.exec(attrs)?.[1] ?? ''),
  );
  return decode(DOMPurify.sanitize(withLatex, { ALLOWED_TAGS: [], KEEP_CONTENT: true }))
    .replace(/\s+/g, ' ')
    .trim();
}
