import { cleanHtml, contentHash, prepareQuestion } from './question-content';

const opts = (...texts: string[]) =>
  texts.map((t, i) => ({ key: 'abcde'[i] as 'a', html: `<p>${t}</p>` }));

describe('cleanHtml', () => {
  it('drops scripts, handlers and non-https images but keeps formatting and math', () => {
    const dirty =
      '<p onclick="x()">বাংলা <b>মোটা</b><script>alert(1)</script></p>' +
      '<img src="javascript:alert(1)" onerror="x()"><img src="http://a/b.png"><img src="https://cdn.x/y.png" alt="y">' +
      '<span data-type="math" data-latex="x^2" class="math-inline evil">x</span><a href="https://x">link</a>';
    const out = cleanHtml(dirty);
    expect(out).toContain('<b>মোটা</b>');
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|http:\/\//);
    expect(out).toContain('<img src="https://cdn.x/y.png" alt="y" />');
    expect(out).toContain('data-latex="x^2"');
    expect(out).toContain('class="math-inline"');
    expect(out).not.toContain('<a ');
  });
});

describe('contentHash', () => {
  it('ignores case, spacing and markup differences', () => {
    const a = contentHash(
      'বাংলাদেশের   রাজধানী কোথায়?',
      opts('ঢাকা', 'খুলনা', 'রাজশাহী', 'সিলেট'),
    );
    const b = contentHash('বাংলাদেশের রাজধানী কোথায়?', opts('ঢাকা ', 'খুলনা', 'রাজশাহী', 'সিলেট'));
    expect(a).toBe(b);
    expect(contentHash('x', opts('a', 'b', 'c', 'd'))).not.toBe(
      contentHash('x', opts('a', 'b', 'c', 'e')),
    );
  });
});

describe('prepareQuestion', () => {
  const base = { body: '<p>What?</p>', options: opts('a1', 'b1', 'c1', 'd1'), correct_option: 'b' };

  it('prepares a valid question', () => {
    const q = prepareQuestion({ ...base, explanation: '<p>because</p><script>1</script>' });
    expect(q.bodyText).toBe('What?');
    expect(q.explanation).toBe('<p>because</p>');
    expect(q.hash).toHaveLength(64);
  });

  it.each([
    ['empty body', { ...base, body: '<p> </p>' }],
    [
      'wrong key order',
      { ...base, options: [{ key: 'b' as const, html: '<p>x</p>' }, ...base.options.slice(1)] },
    ],
    ['correct option missing', { ...base, correct_option: 'e' }],
    ['empty option', { ...base, options: opts('a1', '', 'c1', 'd1') }],
  ])('rejects %s', (_name, input) => {
    expect(() => prepareQuestion(input)).toThrow();
  });
});
