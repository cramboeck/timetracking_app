import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeEmailHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null as any)).toBe('');
    expect(sanitizeHtml(undefined as any)).toBe('');
  });

  it('allows safe HTML tags', () => {
    const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('removes script tags', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    expect(sanitizeHtml(input)).toBe('<p>Hello</p>');
  });

  it('removes inline event handlers', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onerror');
  });

  it('removes javascript: URLs', () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('allows img tags with src', () => {
    const input = '<img src="https://example.com/image.png" alt="test">';
    const result = sanitizeHtml(input);
    expect(result).toContain('src="https://example.com/image.png"');
  });

  it('allows table elements', () => {
    const input = '<table><tr><td>Cell</td></tr></table>';
    expect(sanitizeHtml(input)).toContain('<table>');
    expect(sanitizeHtml(input)).toContain('<td>');
  });

  it('allows lists', () => {
    const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('allows headings', () => {
    const input = '<h1>Title</h1><h2>Subtitle</h2>';
    expect(sanitizeHtml(input)).toBe(input);
  });
});

describe('sanitizeEmailHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeEmailHtml('')).toBe('');
  });

  it('adds rel and target attributes to links', () => {
    const input = '<a href="https://example.com">Link</a>';
    const result = sanitizeEmailHtml(input);
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it('sanitizes content before processing links', () => {
    const input = '<a href="javascript:alert(1)">Bad link</a><script>alert(1)</script>';
    const result = sanitizeEmailHtml(input);
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('<script>');
  });
});
