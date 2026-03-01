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
});
