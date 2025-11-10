/**
 * Generate a UUID (Universally Unique Identifier)
 *
 * Uses crypto.randomUUID() if available (HTTPS/localhost),
 * otherwise falls back to a custom implementation that works in all contexts.
 */
export function generateUUID(): string {
  // Try to use native crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fall through to fallback implementation
    }
  }

  // Fallback implementation (RFC4122 version 4 compliant)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
