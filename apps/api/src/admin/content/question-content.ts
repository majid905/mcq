import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { htmlToText } from '../../search/html-text';

/**
 * Editor output (TipTap + KaTeX) is stored as HTML and later rendered by web and mobile, so it is
 * cleaned on the way in: no scripts, no event handlers, images only over https. Math nodes keep
 * their LaTeX in data attributes.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
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
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'h3',
    'h4',
    'h5',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'img',
  ],
  allowedAttributes: {
    span: ['class', 'data-type', 'data-latex'],
    div: ['class', 'data-type', 'data-latex'],
    img: ['src', 'alt', 'width', 'height'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https'],
  allowedSchemesByTag: { img: ['https'] },
  allowProtocolRelative: false,
  allowedClasses: { span: ['math-inline', 'math-block', 'katex'], div: ['math-block'] },
};

export const cleanHtml = (html: string): string => sanitizeHtml(html, OPTIONS).trim();

export interface OptionInput {
  key: 'a' | 'b' | 'c' | 'd' | 'e';
  html: string;
}

/** Normalised text used for the duplicate check: same question text and options (any order of spaces/case) = same hash. */
export function contentHash(bodyText: string, options: OptionInput[]): string {
  const normalized = [bodyText, ...options.map((o) => htmlToText(o.html))]
    .map((s) => s.normalize('NFC').replace(/\s+/g, ' ').trim())
    .join('|')
    .toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

export interface PreparedQuestion {
  body: string;
  bodyText: string;
  options: OptionInput[];
  explanation: string | null;
  hash: string;
}

/** Sanitise, derive plain text and hash. Throws a message when the content is unusable. */
export function prepareQuestion(input: {
  body: string;
  options: OptionInput[];
  correct_option: string;
  explanation?: string | null | undefined;
}): PreparedQuestion {
  const body = cleanHtml(input.body);
  const bodyText = htmlToText(body);
  const options = input.options.map((o) => ({ key: o.key, html: cleanHtml(o.html) }));
  const keys = options.map((o) => o.key);
  if (bodyText === '' && !/<img\b/i.test(body)) throw new Error('body is empty');
  if (new Set(keys).size !== keys.length) throw new Error('duplicate option keys');
  if (keys.join('') !== 'abcde'.slice(0, keys.length))
    throw new Error('options must be a, b, c, d[, e] in order');
  if (!keys.includes(input.correct_option as OptionInput['key'])) {
    throw new Error('correct_option is not one of the options');
  }
  if (options.some((o) => htmlToText(o.html) === '' && !/<img\b/i.test(o.html))) {
    throw new Error('an option is empty');
  }
  const explanation = input.explanation ? cleanHtml(input.explanation) : null;
  return {
    body,
    bodyText,
    options,
    explanation: explanation === '' ? null : explanation,
    hash: contentHash(bodyText, options),
  };
}
