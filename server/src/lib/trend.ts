import { daysBetween, round1 } from './core.js';

export type Weigh = { date: string; weightKg: number };

/** Adds a trailing 7-day average (over the weigh-ins within the last 7 calendar days). Entries must be sorted by date. */
export function withTrend(entries: Weigh[]) {
  return entries.map((e, i) => {
    const window = entries.slice(0, i + 1).filter((x) => daysBetween(x.date, e.date) < 7);
    const avg = window.reduce((n, x) => n + x.weightKg, 0) / window.length;
    return { date: e.date, weightKg: e.weightKg, trendKg: round1(avg) };
  });
}
