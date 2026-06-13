import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  formatTime,
  formatDate,
  calculateDuration,
  toLocalDateString,
} from './time';

describe('formatDuration', () => {
  it('formats 0 seconds as 00:00:00', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  it('formats seconds correctly', () => {
    expect(formatDuration(45)).toBe('00:00:45');
  });

  it('formats minutes and seconds correctly', () => {
    expect(formatDuration(125)).toBe('00:02:05');
  });

  it('formats hours, minutes, and seconds correctly', () => {
    expect(formatDuration(3661)).toBe('01:01:01');
  });

  it('formats large durations correctly', () => {
    expect(formatDuration(86400)).toBe('24:00:00');
  });
});

describe('formatTime', () => {
  it('formats time in 24-hour format by default', () => {
    const date = new Date('2026-06-13T14:30:00');
    expect(formatTime(date)).toBe('14:30');
  });

  it('formats time in 12-hour format when specified', () => {
    const date = new Date('2026-06-13T14:30:00');
    expect(formatTime(date, false)).toBe('2:30 PM');
  });

  it('handles midnight in 12-hour format', () => {
    const date = new Date('2026-06-13T00:00:00');
    expect(formatTime(date, false)).toBe('12:00 AM');
  });

  it('handles noon in 12-hour format', () => {
    const date = new Date('2026-06-13T12:00:00');
    expect(formatTime(date, false)).toBe('12:00 PM');
  });

  it('accepts string dates', () => {
    expect(formatTime('2026-06-13T09:05:00')).toBe('09:05');
  });
});

describe('formatDate', () => {
  it('formats date in German format (DD.MM.YYYY)', () => {
    const date = new Date('2026-06-13');
    expect(formatDate(date)).toBe('13.06.2026');
  });

  it('accepts string dates', () => {
    expect(formatDate('2026-01-05')).toBe('05.01.2026');
  });
});

describe('calculateDuration', () => {
  it('calculates duration in seconds', () => {
    const start = '2026-06-13T10:00:00';
    const end = '2026-06-13T10:01:30';
    expect(calculateDuration(start, end)).toBe(90);
  });

  it('handles cross-hour durations', () => {
    const start = '2026-06-13T10:45:00';
    const end = '2026-06-13T11:15:00';
    expect(calculateDuration(start, end)).toBe(1800);
  });
});

describe('toLocalDateString', () => {
  it('formats date as YYYY-MM-DD', () => {
    const date = new Date(2026, 5, 13);
    expect(toLocalDateString(date)).toBe('2026-06-13');
  });

  it('pads single-digit months and days', () => {
    const date = new Date(2026, 0, 5);
    expect(toLocalDateString(date)).toBe('2026-01-05');
  });
});
