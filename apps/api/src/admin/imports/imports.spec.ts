import ExcelJS from 'exceljs';
import {
  checkMapping,
  mapRow,
  normalizeText,
  parseCorrect,
  suggestMapping,
  type Lookups,
  type Mapping,
} from './mapping';
import { parseCsv, parseDocxText, parseXlsx } from './parsers';

const lookups: Lookups = {
  topics: new Map([
    ['12', [12]],
    ['history', [12]],
    ['ইতিহাস', [12]],
    ['dup', [1, 2]],
  ]),
  sources: new Map([['bcs 40th', [7]]]),
};
const mapping: Mapping = {
  body: 'Q',
  option_a: 'A',
  option_b: 'B',
  option_c: 'C',
  option_d: 'D',
  option_e: 'E',
  correct: 'Ans',
  explanation: 'Why',
  topic: 'Topic',
  difficulty: 'Level',
  source_exam: 'Src',
  source_year: 'Year',
  is_premium: 'Prem',
};
const row = (over: Record<string, string> = {}) => ({
  Q: 'বাংলাদেশের রাজধানী কোথায়?',
  A: 'ঢাকা',
  B: 'খুলনা',
  C: 'রাজশাহী',
  D: 'সিলেট',
  E: '',
  Ans: 'A',
  Why: 'ঢাকা রাজধানী',
  Topic: 'History',
  Level: '2',
  Src: 'BCS 40th',
  Year: '২০২১',
  Prem: 'yes',
  ...over,
});

describe('parsers', () => {
  it('reads CSV with BOM, quotes, embedded newlines and blank lines', () => {
    const csv = Buffer.from(
      '﻿Question,A,B,Answer\n"Line one\nline two",x,"y, z",B\n\n,, ,\nq2,1,2,A\n',
    );
    const t = parseCsv(csv);
    expect(t.columns).toEqual(['Question', 'A', 'B', 'Answer']);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toEqual({ Question: 'Line one\nline two', A: 'x', B: 'y, z', Answer: 'B' });
  });

  it('de-duplicates header names and fills empty ones', () => {
    const t = parseCsv(Buffer.from('A,A,\n1,2,3\n'));
    expect(t.columns).toEqual(['A', 'A (2)', 'Column 3']);
  });

  it('reads the first sheet of an xlsx, including numbers, rich text and blank rows', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Questions');
    ws.addRow(['Question', 'Year', 'Answer']);
    ws.addRow(['প্রশ্ন ১', 2021, 'ক']);
    ws.addRow([{ richText: [{ text: 'rich ' }, { text: 'text' }] }, 1999, 'B']);
    ws.addRow([]);
    ws.addRow(['last', 2000, 'c']);
    wb.addWorksheet('Other').addRow(['ignored']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const t = await parseXlsx(buf);
    expect(t.columns).toEqual(['Question', 'Year', 'Answer']);
    expect(t.rows).toEqual([
      { Question: 'প্রশ্ন ১', Year: '2021', Answer: 'ক' },
      { Question: 'rich text', Year: '1999', Answer: 'B' },
      { Question: 'last', Year: '2000', Answer: 'c' },
    ]);
  });

  it('parses the Word template: English and Bangla labels, continued lines, optional parts', () => {
    const text = [
      'Q1. বাংলাদেশের স্বাধীনতা কবে?',
      'A) ১৯৭০',
      'B) ১৯৭১',
      'C) ১৯৭২',
      'D) ১৯৭৩',
      'Answer: B',
      'Explanation: ২৬ মার্চ',
      'ঘোষণা হয়।',
      'Topic: History',
      '',
      'প্রশ্ন: রাজধানী কোথায়?',
      'ক) ঢাকা',
      'খ) খুলনা',
      'গ) সিলেট',
      'ঘ) বরিশাল',
      'ঙ) রংপুর',
      'উত্তর: ক',
      '',
    ].join('\n');
    const t = parseDocxText(text);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toMatchObject({
      Question: 'বাংলাদেশের স্বাধীনতা কবে?',
      A: '১৯৭০',
      B: '১৯৭১',
      Answer: 'B',
      Explanation: '২৬ মার্চ ঘোষণা হয়।',
      Topic: 'History',
    });
    expect(t.rows[1]).toMatchObject({ Question: 'রাজধানী কোথায়?', E: 'রংপুর', Answer: 'ক' });
  });
});

describe('mapping', () => {
  it('guesses a mapping from English and Bangla headers', () => {
    const m = suggestMapping(['প্রশ্ন', 'A', 'B', 'C', 'D', 'উত্তর', 'Topic', 'Year']);
    expect(m).toMatchObject({
      body: 'প্রশ্ন',
      option_a: 'A',
      option_d: 'D',
      correct: 'উত্তর',
      topic: 'Topic',
      source_year: 'Year',
    });
  });

  it('reports missing required fields and unknown columns', () => {
    const problems = checkMapping({ body: 'Nope', option_a: 'A' }, ['A']);
    expect(problems.map((p) => p.field)).toEqual(
      expect.arrayContaining(['option_b', 'correct', 'topic', 'body']),
    );
    expect(problems.find((p) => p.field === 'body')?.message).toMatch(/not in the file/);
  });

  it('understands answers as letters, Bangla letters or numbers', () => {
    expect(['a', ' B ', '(c)', 'ঘ', '৩', '5', 'z', ''].map(parseCorrect)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'c',
      'e',
      null,
      null,
    ]);
  });

  it('normalises text without breaking Bangla joiners', () => {
    expect(normalizeText('﻿  ক খ ​ গ ')).toBe('ক খ গ');
    expect(normalizeText('ক্‌ষ')).toBe('ক্‌ষ');
  });

  it('maps a good row, with Bangla digits, source lookup and premium flag', () => {
    const r = mapRow(row(), mapping, lookups);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.question).toMatchObject({
      nodeId: 12,
      correct: 'a',
      difficulty: 2,
      sourceExamId: 7,
      sourceYear: 2021,
      isPremium: true,
    });
    expect(r.question.options.map((o) => o.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.question.body).toBe('<p>বাংলাদেশের রাজধানী কোথায়?</p>');
    expect(r.question.hash).toHaveLength(64);
  });

  it('keeps a fifth option only when it has text, and sanitises HTML cells', () => {
    const r = mapRow(
      row({ E: 'বরিশাল', Q: '<p onclick="x()">প্রশ্ন <b>মোটা</b><script>1</script></p>' }),
      mapping,
      lookups,
    );
    expect(r.ok && r.question.options).toHaveLength(5);
    expect(r.ok && r.question.body).toBe('<p>প্রশ্ন <b>মোটা</b></p>');
  });

  it.each([
    ['unknown topic', { Topic: 'Nowhere' }, 'topic', /unknown topic/],
    ['ambiguous topic', { Topic: 'dup' }, 'topic', /matches 2 entries/],
    ['bad answer', { Ans: 'Z' }, 'correct', /not a\/b\/c\/d\/e/],
    ['empty option', { C: ' ' }, 'option_c', /empty/],
    ['difficulty out of range', { Level: '9' }, 'difficulty', /1 to 5/],
    ['unknown source', { Src: 'BCS 99th' }, 'source_exam', /unknown source exam/],
    ['bad year', { Year: '19' }, 'source_year', /not a year/],
    ['empty question', { Q: '  ' }, 'body', /empty/],
  ])('rejects %s', (_name, over, field, message) => {
    const r = mapRow(row(over), mapping, lookups);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe(field);
    expect(r.message).toMatch(message);
  });

  it('gives the same hash for the same question however it is spaced or cased', () => {
    const a = mapRow(row(), mapping, lookups);
    const b = mapRow(row({ Q: '  বাংলাদেশের   রাজধানী কোথায়?  ', A: 'ঢাকা ' }), mapping, lookups);
    expect(a.ok && b.ok && a.question.hash === b.question.hash).toBe(true);
  });
});
