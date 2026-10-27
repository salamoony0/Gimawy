import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatPace, localDay, relativeDay, shiftDay } from './format';

describe('shiftDay', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is not thrown off by daylight saving changes', () => {
    expect(shiftDay('2026-03-28', 2)).toBe('2026-03-30');
    expect(shiftDay('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('relativeDay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 12)); // Tue 27 Oct 2026, local time
  });
  afterEach(() => vi.useRealTimers());

  it('names today, yesterday and the past week', () => {
    expect(localDay()).toBe('2026-10-27');
    expect(relativeDay('2026-10-27')).toBe('Today');
    expect(relativeDay('2026-10-26')).toBe('Yesterday');
    expect(relativeDay('2026-10-23')).toBe('Friday');
  });

  it('shows a date for older days, with the year only when it differs', () => {
    expect(relativeDay('2026-09-01')).toMatch(/Sep/);
    expect(relativeDay('2026-09-01')).not.toMatch(/2026/);
    expect(relativeDay('2025-09-01')).toMatch(/2025/);
  });
});

describe('formatPace', () => {
  it('formats minutes per unit as m:ss', () => {
    expect(formatPace(25, 5)).toBe('5:00');
    expect(formatPace(27.5, 5)).toBe('5:30');
  });

  it('carries 60 seconds into the next minute', () => {
    expect(formatPace(4.999, 1)).toBe('5:00');
  });
});
