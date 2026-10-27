import { parse as parseCsvSync } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';

export interface Table {
  columns: string[];
  rows: Record<string, string>[];
}

export const MAX_ROWS = 100_000;

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toAsciiDigits = (s: string): string =>
  s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** Excel cells can be rich text, formulas, hyperlinks, dates ... all become plain strings. */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
  }
  return '';
}

/** Header names must be unique and non-empty so a mapping can point at them. */
function headerNames(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function tooMany(): never {
  throw new Error(`more than ${MAX_ROWS} rows in one file; split it`);
}

export function parseCsv(buf: Buffer): Table {
  const records = parseCsvSync(buf, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    columns: false,
  }) as string[][];
  const [head, ...body] = records;
  if (!head) return { columns: [], rows: [] };
  if (body.length > MAX_ROWS) tooMany();
  const columns = headerNames(head);
  const rows = body
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
  return { columns, rows };
}

/**
 * First sheet only. The streaming reader is not used: it needs workbook.xml and the shared strings
 * before the sheets in the zip, and Excel writes them after, so it silently loses cell text.
 */
export async function parseXlsx(buf: Buffer): Promise<Table> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { columns: [], rows: [] };
  let columns: string[] | null = null;
  const rows: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
    if (columns === null) {
      columns = headerNames(values);
      return;
    }
    if (values.every((v) => v.trim() === '')) return;
    if (rows.length >= MAX_ROWS) tooMany();
    const cols: string[] = columns;
    rows.push(Object.fromEntries(cols.map((c, i) => [c, (values[i] ?? '').trim()])));
  });
  return { columns: columns ?? [], rows };
}

// ---------------------------------------------------------------------------------- docx template

const LABELS: [RegExp, string][] = [
  [/^(?:answer|ans|উত্তর)\s*[:：.-]\s*/i, 'Answer'],
  [/^(?:explanation|ব্যাখ্যা)\s*[:：.-]\s*/i, 'Explanation'],
  [/^(?:topic|বিষয়)\s*[:：.-]\s*/i, 'Topic'],
  [/^(?:difficulty|কঠিনতা)\s*[:：.-]\s*/i, 'Difficulty'],
  [/^(?:year|সাল)\s*[:：.-]\s*/i, 'Year'],
  [/^(?:source|সূত্র)\s*[:：.-]\s*/i, 'Source'],
];
const OPTION_LABEL: Record<string, string> = {
  a: 'A',
  b: 'B',
  c: 'C',
  d: 'D',
  e: 'E',
  ক: 'A',
  খ: 'B',
  গ: 'C',
  ঘ: 'D',
  ঙ: 'E',
};
const OPTION_RE = /^\(?([a-eA-Eকখগঘঙ])[).:]\s+(.*)$/;
const QUESTION_RE = /^(?:q(?:uestion)?|প্রশ্ন)?\s*\d*\s*[:：.)]\s*(.*)$/i;
export const DOCX_COLUMNS = [
  'Question',
  'A',
  'B',
  'C',
  'D',
  'E',
  'Answer',
  'Explanation',
  'Topic',
  'Difficulty',
  'Year',
  'Source',
];

/**
 * Fixed Word template, one question per block, blocks separated by a blank line:
 *   Q: question text            (or প্রশ্ন: / 1. / Q1.)
 *   A) ...  B) ...  C) ...  D) ...  [E) ...]      (or ক) খ) গ) ঘ))
 *   Answer: B                    Explanation: ...   Topic: ...   Difficulty: 3   Year: 2021   Source: ...
 * Text lines that follow the question or an option without a label continue it.
 */
export function parseDocxText(text: string): Table {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/);
  const rows: Record<string, string>[] = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const row: Record<string, string> = Object.fromEntries(DOCX_COLUMNS.map((c) => [c, '']));
    let current: string | null = null;
    for (const line of lines) {
      const labelled = LABELS.find(([re]) => re.test(line));
      const option = OPTION_RE.exec(line);
      if (labelled) {
        current = labelled[1];
        row[current] = line.replace(labelled[0], '');
      } else if (option) {
        current = OPTION_LABEL[(option[1] as string).toLowerCase()] ?? 'A';
        row[current] = option[2] as string;
      } else if (current === null || (current === 'Question' && row['Question'] === '')) {
        current = 'Question';
        const q = QUESTION_RE.exec(line);
        row['Question'] = (row['Question'] ? `${row['Question']} ` : '') + (q?.[1] ?? line);
      } else {
        row[current] = `${row[current]} ${line}`.trim();
      }
    }
    rows.push(row);
    if (rows.length > MAX_ROWS) tooMany();
  }
  return { columns: DOCX_COLUMNS, rows };
}

export async function parseDocx(buf: Buffer): Promise<Table> {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return parseDocxText(value);
}

export async function parseTable(fileName: string, buf: Buffer): Promise<Table> {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'csv') return parseCsv(buf);
  if (ext === 'xlsx') return parseXlsx(buf);
  if (ext === 'docx') return parseDocx(buf);
  throw new Error('unsupported file type; use .xlsx, .csv or .docx');
}
