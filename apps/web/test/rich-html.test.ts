import { describe, expect, it } from 'vitest';
import { renderRichHtml, richToText } from '../lib/rich-html';

describe('renderRichHtml', () => {
  it('removes scripts, event handlers and javascript: URLs', () => {
    const out = renderRichHtml(
      '<p onclick="alert(1)">ক<script>alert(1)</script><img src="javascript:alert(1)"><a href="javascript:x">l</a></p>',
    );
    expect(out).not.toMatch(/script|onclick|javascript:/i);
    expect(out).toContain('ক');
  });

  it('renders inline and block math from the editor markup', () => {
    const inline = renderRichHtml(
      '<p>যদি <span class="math" data-latex="x^2 = 49">x^2</span> হয়</p>',
    );
    expect(inline).toContain('class="katex"');
    expect(inline).not.toContain('katex-display');
    expect(inline).toContain('যদি');

    const block = renderRichHtml(
      '<div class="math" data-latex="\\frac{a}{b}" data-display="true"></div>',
    );
    expect(block).toContain('katex-display');
    expect(block).toContain('mfrac');
  });

  it('renders \\( \\) and \\[ \\] delimiters from imported text', () => {
    expect(renderRichHtml('<p>\\(a+b\\)</p>')).toContain('class="katex"');
    expect(renderRichHtml('<p>\\[a+b\\]</p>')).toContain('katex-display');
  });

  it('decodes entities inside data-latex', () => {
    const out = renderRichHtml('<span class="math" data-latex="a &lt; b &gt; c">x</span>');
    expect(out).toContain('<annotation encoding="application/x-tex">a &lt; b &gt; c</annotation>');
  });

  it('keeps bad LaTeX visible instead of throwing', () => {
    expect(() => renderRichHtml('<span class="math" data-latex="\\frac{">x</span>')).not.toThrow();
  });
});

describe('richToText', () => {
  it('strips tags and keeps the LaTeX source', () => {
    expect(richToText('<p>যদি <span class="math" data-latex="x^2">x</span> <b>হয়</b></p>')).toBe(
      'যদি x^2 হয়',
    );
  });
});
