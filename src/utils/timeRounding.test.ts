import { describe, it, expect } from 'vitest';
import {
  roundTimeUp,
  formatRoundedTime,
  getRoundingIntervalLabel,
  calculateBillableDuration,
} from './timeRounding';

describe('roundTimeUp', () => {
  it('returns unchanged value for 1-minute interval', () => {
    expect(roundTimeUp(125, 1)).toBe(125);
  });

  it('rounds up to 5 minutes', () => {
    expect(roundTimeUp(61, 5)).toBe(300);
    expect(roundTimeUp(299, 5)).toBe(300);
    expect(roundTimeUp(300, 5)).toBe(300);
    expect(roundTimeUp(301, 5)).toBe(600);
  });

  it('rounds up to 15 minutes', () => {
    expect(roundTimeUp(1, 15)).toBe(900);
    expect(roundTimeUp(899, 15)).toBe(900);
    expect(roundTimeUp(900, 15)).toBe(900);
    expect(roundTimeUp(901, 15)).toBe(1800);
  });

  it('rounds up to 30 minutes', () => {
    expect(roundTimeUp(1, 30)).toBe(1800);
    expect(roundTimeUp(1800, 30)).toBe(1800);
    expect(roundTimeUp(1801, 30)).toBe(3600);
  });

  it('rounds up to 60 minutes', () => {
    expect(roundTimeUp(1, 60)).toBe(3600);
    expect(roundTimeUp(3600, 60)).toBe(3600);
    expect(roundTimeUp(3601, 60)).toBe(7200);
  });
});

describe('formatRoundedTime', () => {
  it('shows simple time when not rounded', () => {
    expect(formatRoundedTime(3600, 3600)).toBe('1:00:00');
  });

  it('shows indication when rounded', () => {
    expect(formatRoundedTime(3601, 7200)).toBe('2:00:00 (1:00:01 aufgerundet)');
  });

  it('formats short durations without hours', () => {
    expect(formatRoundedTime(65, 300)).toBe('5:00 (1:05 aufgerundet)');
  });
});

describe('getRoundingIntervalLabel', () => {
  it('returns "Keine Aufrundung" for 1 minute', () => {
    expect(getRoundingIntervalLabel(1)).toBe('Keine Aufrundung');
  });

  it('returns "1 Stunde" for 60 minutes', () => {
    expect(getRoundingIntervalLabel(60)).toBe('1 Stunde');
  });

  it('returns "X Minuten" for other intervals', () => {
    expect(getRoundingIntervalLabel(5)).toBe('5 Minuten');
    expect(getRoundingIntervalLabel(15)).toBe('15 Minuten');
    expect(getRoundingIntervalLabel(30)).toBe('30 Minuten');
  });
});

describe('calculateBillableDuration', () => {
  it('returns 0 for non-billable entries', () => {
    expect(calculateBillableDuration(3600, 15, false)).toBe(0);
  });

  it('rounds billable entries', () => {
    expect(calculateBillableDuration(901, 15, true)).toBe(1800);
  });

  it('defaults to billable=true', () => {
    expect(calculateBillableDuration(901, 15)).toBe(1800);
  });
});
