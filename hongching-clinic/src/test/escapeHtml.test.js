import { describe, it, expect } from 'vitest';
import escapeHtml, { h } from '../utils/escapeHtml';

describe('escapeHtml', () => {
  it('escapes HTML angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes forward slashes', () => {
    expect(escapeHtml('a/b')).toBe('a&#x2F;b');
  });

  it('escapes backticks', () => {
    expect(escapeHtml('`code`')).toBe('&#96;code&#96;');
  });

  it('handles null input', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('handles undefined input', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('converts numbers to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('does not double-escape (ampersand gets escaped again)', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('handles strings with no special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes multiple different special characters together', () => {
    expect(escapeHtml('<a href="url">text & more</a>')).toBe(
      '&lt;a href=&quot;url&quot;&gt;text &amp; more&lt;&#x2F;a&gt;'
    );
  });

  // ── Additional edge cases ──

  it('handles very long strings (10000+ chars) without truncation', () => {
    const long = '<b>' + 'a'.repeat(10000) + '</b>';
    const result = escapeHtml(long);
    expect(result).toBe('&lt;b&gt;' + 'a'.repeat(10000) + '&lt;&#x2F;b&gt;');
    // Verify the length accounts for the expanded entities
    expect(result.length).toBeGreaterThan(10000);
  });

  it('handles very long strings consisting entirely of special characters', () => {
    const input = '<>'.repeat(5000); // 10000 chars of special characters
    const result = escapeHtml(input);
    expect(result).toBe('&lt;&gt;'.repeat(5000));
  });

  it('handles mixed Unicode characters and HTML entities', () => {
    const input = '你好 <World> & 世界 "日本語" 한국어';
    const result = escapeHtml(input);
    expect(result).toBe('你好 &lt;World&gt; &amp; 世界 &quot;日本語&quot; 한국어');
  });

  it('handles CJK characters with embedded special chars', () => {
    const input = '患者姓名：<張三> & "李四"';
    const result = escapeHtml(input);
    expect(result).toContain('&lt;張三&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;李四&quot;');
  });

  it('handles emoji characters mixed with HTML', () => {
    const input = '👋 <hello> & "world" 🌍';
    const result = escapeHtml(input);
    expect(result).toBe('👋 &lt;hello&gt; &amp; &quot;world&quot; 🌍');
  });

  it('handles numbers passed as numeric strings', () => {
    expect(escapeHtml('0')).toBe('0');
    expect(escapeHtml('123')).toBe('123');
    expect(escapeHtml('-1')).toBe('-1');
    expect(escapeHtml('3.14')).toBe('3.14');
  });

  it('handles negative numbers', () => {
    expect(escapeHtml(-42)).toBe('-42');
  });

  it('handles floating point numbers', () => {
    expect(escapeHtml(3.14159)).toBe('3.14159');
  });

  it('handles zero', () => {
    expect(escapeHtml(0)).toBe('0');
  });

  it('handles boolean values', () => {
    expect(escapeHtml(true)).toBe('true');
    expect(escapeHtml(false)).toBe('false');
  });

  it('handles strings with only whitespace', () => {
    expect(escapeHtml('   ')).toBe('   ');
    expect(escapeHtml('\t\n')).toBe('\t\n');
  });

  it('handles newlines within HTML content', () => {
    const input = '<div>\n  <span>\n  </span>\n</div>';
    const result = escapeHtml(input);
    expect(result).toContain('\n');
    expect(result).not.toContain('<div>');
  });
});

describe('h tagged template literal', () => {
  it('escapes interpolated values', () => {
    const name = '<script>alert(1)</script>';
    const result = h`<div>${name}</div>`;
    expect(result).toBe('<div>&lt;script&gt;alert(1)&lt;&#x2F;script&gt;</div>');
  });

  it('does not escape literal template parts', () => {
    const result = h`<b>${'safe'}</b>`;
    expect(result).toBe('<b>safe</b>');
  });

  it('handles multiple interpolations', () => {
    const a = '<em>';
    const b = '</em>';
    const result = h`start ${a} middle ${b} end`;
    expect(result).toBe('start &lt;em&gt; middle &lt;&#x2F;em&gt; end');
  });

  it('handles null/undefined interpolated values', () => {
    const result = h`value: ${null}`;
    expect(result).toBe('value: ');
  });

  it('handles numeric interpolated values', () => {
    const result = h`count: ${42}`;
    expect(result).toBe('count: 42');
  });

  // ── Additional edge cases ──

  it('handles many interpolations (5+)', () => {
    const a = '<a>';
    const b = '"b"';
    const c = 'c & d';
    const d = '`e`';
    const e = 'f/g';
    const result = h`1:${a} 2:${b} 3:${c} 4:${d} 5:${e}`;
    expect(result).toBe(
      '1:&lt;a&gt; 2:&quot;b&quot; 3:c &amp; d 4:&#96;e&#96; 5:f&#x2F;g'
    );
  });

  it('escapes interpolated values in nested template structure', () => {
    const inner = '<b>bold</b>';
    const outer = h`<div>inner: ${inner}</div>`;
    expect(outer).toBe('<div>inner: &lt;b&gt;bold&lt;&#x2F;b&gt;</div>');
    // Use the result of one h call as part of another — already-escaped content
    const nested = h`<section>${outer}</section>`;
    // The already-escaped entities get double-escaped because h escapes interpolations
    expect(nested).toContain('&amp;lt;b&amp;gt;');
  });

  it('handles interpolated zero and false values', () => {
    expect(h`val:${0}`).toBe('val:0');
    expect(h`val:${false}`).toBe('val:false');
  });

  it('handles interpolated empty string', () => {
    expect(h`before${''}after`).toBe('beforeafter');
  });

  it('handles interpolated undefined', () => {
    expect(h`x:${undefined}`).toBe('x:');
  });

  it('handles interpolated strings with only special characters', () => {
    const result = h`data: ${'<>&"\'/`'}`;
    expect(result).toBe('data: &lt;&gt;&amp;&quot;&#x27;&#x2F;&#96;');
  });

  it('handles Unicode interpolated values', () => {
    const name = '張三 <admin>';
    const result = h`<span>名字: ${name}</span>`;
    expect(result).toBe('<span>名字: 張三 &lt;admin&gt;</span>');
  });

  it('handles number strings as interpolated values', () => {
    const result = h`ID: ${'007'} Code: ${'<100>'}`;
    expect(result).toBe('ID: 007 Code: &lt;100&gt;');
  });

  it('preserves template literal whitespace and newlines', () => {
    const val = '<x>';
    const result = h`
      line1: ${val}
      line2: done
    `;
    expect(result).toContain('line1: &lt;x&gt;');
    expect(result).toContain('line2: done');
  });
});
