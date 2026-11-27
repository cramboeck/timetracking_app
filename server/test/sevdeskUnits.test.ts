import { describe, it, expect } from 'vitest';
import { pickUnits } from '../src/utils/sevdeskUnits';

describe('pickUnits', () => {
  it('findet Stunde und Stück im Konto', () => {
    expect(pickUnits([
      { id: '1', name: 'Stk', translationCode: 'UNITY_PIECE' },
      { id: '17', name: 'Std.', translationCode: 'UNITY_HOUR' },
    ])).toEqual({ hour: 17, piece: 1, source: 'account' });
  });
  it('erkennt deutsche Namen ohne translationCode', () => {
    expect(pickUnits([{ id: '4', name: 'Stunden' }, { id: '2', name: 'Stück' }])).toEqual({ hour: 4, piece: 2, source: 'account' });
  });
  it('verwechselt „Stück“ nicht mit „Stunde“', () => {
    expect(pickUnits([{ id: '2', name: 'Stück' }]).hour).toBe(9);
  });
  it('fällt ohne Treffer auf die alten IDs zurück', () => {
    expect(pickUnits([])).toEqual({ hour: 9, piece: 1, source: 'fallback' });
  });
});
