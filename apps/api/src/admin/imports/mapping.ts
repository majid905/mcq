import { htmlToText } from '../../search/html-text';
import { prepareQuestion, type OptionInput } from '../content/question-content';
import { toAsciiDigits } from './parsers';

export const FIELDS = [
  'body',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'option_e',
  'correct',
  'explanation',
  'topic',
  'difficulty',
  'source_exam',
  'source_year',
  'is_premium',
] as const;
export type Field = (typeof FIELDS)[number];
export const REQUIRED_FIELDS: Field[] = [
  'body',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct',
  'topic',
];

export type Mapping = Partial<Record<Field, string>>;

/** Guesses a mapping from header names (English and Bangla), so the wizard starts pre-filled. */
const GUESS: Record<Field, RegExp> = {
  body: /^(question|প্রশ্ন|body|q)$/i,
  option_a: /^(a|option ?a|opt ?a|ক|বিকল্প ?ক)$/i,
  option_b: /^(b|option ?b|opt ?b|খ|বিকল্প ?খ)$/i,
  option_c: /^(c|option ?c|opt ?c|গ|বিকল্প ?গ)$/i,
  option_d: /^(d|option ?d|opt ?d|ঘ|বিকল্প ?ঘ)$/i,
  option_e: /^(e|option ?e|opt ?e|ঙ|বিকল্প ?ঙ)$/i,
  correct: /^(answer|ans|correct|উত্তর|সঠিক উত্তর)$/i,
  explanation: /^(explanation|ব্যাখ্যা|solution)$/i,
  topic: /^(topic|বিষয়|টপিক|node|category)$/i,
  difficulty: /^(difficulty|level|কঠিনতা)$/i,
  source_exam: /^(source|source exam|সূত্র|পরীক্ষা)$/i,
  source_year: /^(year|সাল|বছর)$/i,
  is_premium: /^(premium|is premium|প্রিমিয়াম)$/i,
};

export function suggestMapping(columns: string[]): Mapping {
  const out: Mapping = {};
  for (const field of FIELDS) {
    const hit = columns.find((c) => GUESS[field].test(c.trim()));
    if (hit) out[field] = hit;
  }
  return out;
}

/** Missing required fields, and mapped columns that do not exist in the file. */
export function checkMapping(
  mapping: Mapping,
  columns: string[],
): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  for (const f of REQUIRED_FIELDS) {
    if (!mapping[f]) problems.push({ field: f, message: 'not mapped' });
  }
  for (const [field, column] of Object.entries(mapping)) {
    if (column && !columns.includes(column)) {
      problems.push({ field, message: `column "${column}" is not in the file` });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------- cell text

/** Unicode NFC, invisible junk out (BOM, zero-width space, NBSP), spaces folded. ZWJ/ZWNJ stay: Bangla needs them. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\uFEFF\u200B\u2060]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A cell that starts with a tag is taken as HTML (and sanitised later); anything else is plain text. */
export function cellToHtml(raw: string): string {
  const t = normalizeText(raw);
  if (t === '') return '';
  if (t.startsWith('<')) return t;
  return `<p>${escapeHtml(t).replace(/\n/g, '<br>')}</p>`;
}

const LETTERS: Record<string, OptionInput['key']> = {
  a: 'a',
  b: 'b',
  c: 'c',
  d: 'd',
  e: 'e',
  ক: 'a',
  খ: 'b',
  গ: 'c',
  ঘ: 'd',
  ঙ: 'e',
  '1': 'a',
  '2': 'b',
  '3': 'c',
  '4': 'd',
  '5': 'e',
};

export function parseCorrect(raw: string): OptionInput['key'] | null {
  const t = toAsciiDigits(normalizeText(raw))
    .toLowerCase()
    .replace(/[().\s]/g, '');
  return LETTERS[t] ?? null;
}

const TRUE_WORDS = new Set(['1', 'true', 'yes', 'y', 'premium', 'হ্যাঁ', 'হ্যা']);
export const parseBool = (raw: string): boolean =>
  TRUE_WORDS.has(toAsciiDigits(raw.trim().toLowerCase()));

// ---------------------------------------------------------------------------------- one row

export interface Lookups {
  /** topic id by id string, slug, name_bn, name_en (lower-cased); several ids = ambiguous */
  topics: Map<string, number[]>;
  sources: Map<string, number[]>;
}

export interface RowQuestion {
  body: string;
  bodyText: string;
  options: OptionInput[];
  correct: OptionInput['key'];
  explanation: string | null;
  difficulty: number;
  nodeId: number;
  sourceExamId: number | null;
  sourceYear: number | null;
  isPremium: boolean;
  hash: string;
}

export type RowResult =
  { ok: true; question: RowQuestion } | { ok: false; field: string; message: string };

const fail = (field: string, message: string): RowResult => ({ ok: false, field, message });

function lookup(map: Map<string, number[]>, raw: string, what: string): number | string {
  const key = normalizeText(raw).toLowerCase();
  const hit = map.get(key);
  if (!hit || hit.length === 0) return `unknown ${what} "${raw}"`;
  if (hit.length > 1) return `${what} "${raw}" matches ${hit.length} entries; use its id`;
  return hit[0] as number;
}

/** Turns one spreadsheet row into a validated question, or says which field is wrong and why. */
export function mapRow(row: Record<string, string>, m: Mapping, lookups: Lookups): RowResult {
  const get = (f: Field): string => (m[f] ? (row[m[f] as string] ?? '') : '');

  const topic = get('topic');
  if (normalizeText(topic) === '') return fail('topic', 'empty');
  const nodeId = lookup(lookups.topics, topic, 'topic');
  if (typeof nodeId === 'string') return fail('topic', nodeId);

  const correct = parseCorrect(get('correct'));
  if (!correct) return fail('correct', `"${get('correct')}" is not a/b/c/d/e`);

  const letters = (['a', 'b', 'c', 'd', 'e'] as const).filter(
    (k) => k !== 'e' || normalizeText(get('option_e')) !== '',
  );
  const options: OptionInput[] = letters.map((k) => ({
    key: k,
    html: cellToHtml(get(`option_${k}` as Field)),
  }));
  for (const o of options) {
    if (htmlToText(o.html) === '') return fail(`option_${o.key}`, 'empty');
  }

  let difficulty = 3;
  const dRaw = toAsciiDigits(get('difficulty').trim());
  if (dRaw !== '') {
    difficulty = Number(dRaw);
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
      return fail('difficulty', 'must be 1 to 5');
    }
  }

  let sourceExamId: number | null = null;
  const sRaw = get('source_exam');
  if (normalizeText(sRaw) !== '') {
    const s = lookup(lookups.sources, sRaw, 'source exam');
    if (typeof s === 'string') return fail('source_exam', s);
    sourceExamId = s;
  }
  let sourceYear: number | null = null;
  const yRaw = toAsciiDigits(get('source_year').trim());
  if (yRaw !== '') {
    sourceYear = Number(yRaw);
    if (!Number.isInteger(sourceYear) || sourceYear < 1950 || sourceYear > 2100) {
      return fail('source_year', 'not a year');
    }
  }

  try {
    const p = prepareQuestion({
      body: cellToHtml(get('body')),
      options,
      correct_option: correct,
      explanation: cellToHtml(get('explanation')) || null,
    });
    return {
      ok: true,
      question: {
        body: p.body,
        bodyText: p.bodyText,
        options: p.options,
        correct,
        explanation: p.explanation,
        difficulty,
        nodeId,
        sourceExamId,
        sourceYear,
        isPremium: m.is_premium ? parseBool(get('is_premium')) : false,
        hash: p.hash,
      },
    };
  } catch (err) {
    return fail('body', (err as Error).message);
  }
}
