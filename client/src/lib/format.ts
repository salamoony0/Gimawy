import { useQuery } from '@tanstack/react-query';
import { api, type User } from './api';

// ---------- dates (local calendar days as YYYY-MM-DD) ----------

export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(day: string, n: number) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return parseDay(day).toLocaleDateString(undefined, opts);
}

/** "Today", "Yesterday", weekday within a week, else "Mar 4". */
export function relativeDay(day: string) {
  const today = localDay();
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  const diff = (parseDay(today).getTime() - parseDay(day).getTime()) / 86_400_000;
  if (diff > 0 && diff < 7) return fmtDay(day, { weekday: 'long' });
  return fmtDay(day, { month: 'short', day: 'numeric', year: day.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function fmtDuration(min: number | null | undefined) {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ---------- numbers ----------

export const fmtInt = (n: number) => Math.round(n).toLocaleString();

export function fmtCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function pctChange(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

// ---------- user + units ----------

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<User>('/auth/me'), retry: false, staleTime: 60_000 });
}

const KG_PER_LB = 0.45359237;
const KM_PER_MI = 1.609344;

/** "m:ss" per distance unit. Rounds to whole seconds first so 4:59.7 becomes 5:00, not 4:60. */
export function formatPace(min: number, distance: number) {
  const total = Math.round((min / distance) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function useUnits() {
  const { data: me } = useMe();
  const lb = me?.weightUnit === 'lb';
  const mi = me?.distanceUnit === 'mi';
  const trim = (n: number, dp = 1) => Number(n.toFixed(dp));
  return {
    w: lb ? 'lb' : 'kg',
    d: mi ? 'mi' : 'km',
    /** kg → display number in the user's unit */
    weight: (kg: number, dp = 1) => trim(lb ? kg / KG_PER_LB : kg, dp),
    /** display number in the user's unit → kg */
    toKg: (v: number) => (lb ? v * KG_PER_LB : v),
    /** km → display number */
    dist: (km: number, dp = 1) => trim(mi ? km / KM_PER_MI : km, dp),
    toKm: (v: number) => (mi ? v * KM_PER_MI : v),
    /** Default plate increment for weight steppers */
    step: lb ? 5 : 2.5,
    /** Pace in min per km/mi */
    pace: (min: number, km: number) => formatPace(min, mi ? km / KM_PER_MI : km),
  };
}

export const MUSCLE_LABEL: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  legs: 'Legs',
  glutes: 'Glutes',
  core: 'Core',
  'full body': 'Full body',
};
