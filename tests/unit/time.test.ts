// tests/unit/time.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseLocalToUtc,
  formatLocalTime,
  formatLocalDateTime,
} from '../../src/shared/time.js';

describe('Time utilities', () => {
  it('correctly converts local ISO to UTC for Asia/Kolkata (+05:30)', () => {
    // 2026-10-26 18:00 IST is 2026-10-26 12:30 UTC
    const utcDate = parseLocalToUtc('2026-10-26T18:00:00', 'Asia/Kolkata');
    expect(utcDate.toISOString()).toBe('2026-10-26T12:30:00.000Z');
  });

  it('correctly converts local ISO to UTC for UTC', () => {
    const utcDate = parseLocalToUtc('2026-10-26T18:00:00', 'UTC');
    expect(utcDate.toISOString()).toBe('2026-10-26T18:00:00.000Z');
  });

  it('correctly handles Daylight Saving Time (DST) for America/New_York', () => {
    // Summer (EDT, UTC-4): 2026-07-15 12:00 -> 16:00 UTC
    const summerUtc = parseLocalToUtc('2026-07-15T12:00:00', 'America/New_York');
    expect(summerUtc.toISOString()).toBe('2026-07-15T16:00:00.000Z');

    // Winter (EST, UTC-5): 2026-12-15 12:00 -> 17:00 UTC
    const winterUtc = parseLocalToUtc('2026-12-15T12:00:00', 'America/New_York');
    expect(winterUtc.toISOString()).toBe('2026-12-15T17:00:00.000Z');
  });

  it('correctly parses already-offset ISO strings directly', () => {
    const utcDate = parseLocalToUtc('2026-10-26T12:30:00.000Z');
    expect(utcDate.toISOString()).toBe('2026-10-26T12:30:00.000Z');
  });

  it('throws on malformed local date string', () => {
    expect(() => parseLocalToUtc('not-a-date')).toThrow();
  });

  it('formats UTC date into user local time string in Asia/Kolkata', () => {
    const utcDate = new Date('2026-10-26T12:30:00.000Z');
    const formatted = formatLocalTime(utcDate, 'Asia/Kolkata');
    expect(formatted).toContain('6:00 PM');
    expect(formatted).toContain('GMT+5:30');
  });

  it('falls back gracefully to UTC formatting on invalid timezone string', () => {
    const utcDate = new Date('2026-10-26T12:30:00.000Z');
    const formatted = formatLocalTime(utcDate, 'Invalid/Timezone_Name');
    expect(formatted).toContain('12:30 PM');
  });

  it('formats full local date time with weekday, date and time', () => {
    const utcDate = new Date('2026-10-26T12:30:00.000Z');
    const full = formatLocalDateTime(utcDate, 'Asia/Kolkata');
    expect(full).toContain('Oct 26');
    expect(full).toContain('6:00 PM');
  });
});
