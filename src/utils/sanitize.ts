/**
 * HTML Sanitization Utility
 *
 * Provides a centralized, safe wrapper around DOMPurify to prevent
 * Cross-Site Scripting (XSS) attacks when rendering untrusted HTML content
 * (e.g., from emails or external sources) via dangerouslySetInnerHTML.
 *
 * Usage:
 *   import { sanitizeHtml } from '../utils/sanitize';
 *   <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(untrustedHtml) }} />
 */

import DOMPurify from 'dompurify';

/**
 * Sanitizes an HTML string by removing potentially dangerous elements and
 * attributes (e.g., <script>, onerror, javascript: hrefs).
 *
 * @param html - The raw HTML string to sanitize.
 * @returns A sanitized HTML string safe for rendering.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    // Allow common formatting tags used in emails
    ALLOWED_TAGS: [
      'a', 'b', 'br', 'blockquote', 'caption', 'code', 'col', 'colgroup',
      'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd',
      'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strong',
      'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
      'time', 'tr', 'u', 'ul',
    ],
    // Allow safe attributes only
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style', 'target', 'rel',
      'width', 'height', 'colspan', 'rowspan', 'align', 'valign',
    ],
    // Force all links to open in a new tab with safe rel attributes
    ADD_ATTR: ['target'],
    // Forbid javascript: and data: URIs in href/src
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    // Allow data: URIs only for images (e.g., inline images in emails)
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Sanitizes HTML and forces all links to open in a new tab safely.
 * Recommended for rendering external email content.
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';

  const clean = sanitizeHtml(html);

  // Post-process: ensure all <a> tags have rel="noopener noreferrer"
  return clean.replace(/<a\s/gi, '<a rel="noopener noreferrer" target="_blank" ');
}
