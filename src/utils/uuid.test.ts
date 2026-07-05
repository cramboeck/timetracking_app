import { describe, it, expect } from 'vitest';
import { generateUUID } from './uuid';

describe('generateUUID', () => {
  it('generates a valid UUID v4 format', () => {
    const uuid = generateUUID();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  it('generates unique UUIDs', () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      uuids.add(generateUUID());
    }
    expect(uuids.size).toBe(100);
  });

  it('has the correct version bit (4)', () => {
    const uuid = generateUUID();
    expect(uuid[14]).toBe('4');
  });

  it('has the correct variant bits (8, 9, a, or b)', () => {
    const uuid = generateUUID();
    expect(['8', '9', 'a', 'b']).toContain(uuid[19].toLowerCase());
  });
});
