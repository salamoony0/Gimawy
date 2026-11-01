import { daysBetween, round1 } from './core.js';

export type Weigh = { date: string; weightKg: number };

/** Adds a trailing 7-day average (over the weigh-ins within the last 7 calendar days). Entries must be sorted by date. */
export function withTrend(entries: Weigh[]) {
  // `start` slides forward to the oldest weigh-in still within 7 days. The window (≤ 7 entries) is summed afresh
  // each time, oldest first, so the result is identical to averaging it directly (a running total drifts).
  let start = 0;
  return entries.map((e, i) => {
    while (daysBetween(entries[start].date, e.date) >= 7) start++;
    let sum = 0;
    for (let j = start; j <= i; j++) sum += entries[j].weightKg;
    return { date: e.date, weightKg: e.weightKg, trendKg: round1(sum / (i - start + 1)) };
  });
}
