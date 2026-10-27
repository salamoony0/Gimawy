import { useSyncExternalStore } from 'react';

/**
 * The workout currently being logged. It lives in localStorage until the user
 * finishes it, so a refresh or a locked phone mid-set never loses progress.
 * Weights are kept as strings in the user's display unit, exactly as typed.
 */
export type DraftSet = { key: string; weight: string; reps: string; done: boolean; isWarmup: boolean };
export type DraftExercise = { key: string; exerciseId: string; name: string; muscleGroup: string; sets: DraftSet[] };
export type ActiveWorkout = {
  name: string;
  startedAt: string;
  exercises: DraftExercise[];
  restEndsAt: number | null;
  restSeconds: number;
  /** Set when editing a saved workout instead of logging a new one. */
  editingId?: string;
  endedAt?: string;
};

const KEY = 'gymawy.activeWorkout';
const listeners = new Set<() => void>();

function read(): ActiveWorkout | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveWorkout) : null;
  } catch {
    return null;
  }
}

let state: ActiveWorkout | null = read();

function emit(next: ActiveWorkout | null) {
  state = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable (private mode) — keep the in-memory copy
  }
  listeners.forEach((l) => l());
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const newSet = (weight = '', reps = ''): DraftSet => ({ key: uid(), weight, reps, done: false, isWarmup: false });

export const workoutStore = {
  get: () => state,
  start(name: string, exercises: DraftExercise[] = []) {
    emit({ name, startedAt: new Date().toISOString(), exercises, restEndsAt: null, restSeconds: 120 });
  },
  /** Load a saved workout into the logger for editing. Sets arrive already ticked. */
  startEdit(w: Pick<ActiveWorkout, 'name' | 'startedAt' | 'endedAt' | 'exercises'> & { id: string }) {
    emit({
      name: w.name,
      startedAt: w.startedAt,
      endedAt: w.endedAt,
      exercises: w.exercises,
      restEndsAt: null,
      restSeconds: 120,
      editingId: w.id,
    });
  },
  update(fn: (w: ActiveWorkout) => ActiveWorkout) {
    if (state) emit(fn(state));
  },
  discard() {
    emit(null);
  },
};

export function useActiveWorkout() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
