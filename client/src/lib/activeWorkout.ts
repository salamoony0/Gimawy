import { useSyncExternalStore } from 'react';

/**
 * The workout currently being logged. It lives in localStorage until the user
 * finishes it, so a refresh or a locked phone mid-set never loses progress.
 * Weights are kept as strings in the user's display unit, exactly as typed.
 */
export type DraftSet = { key: string; weight: string; reps: string; done: boolean; isWarmup: boolean };
export type DraftExercise = {
  key: string;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  sets: DraftSet[];
  /** Consecutive exercises sharing this key are a superset. */
  superset?: string;
};
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

export type SupersetSlot = { letter: string; index: number; size: number; groupIndex: number };

/**
 * Where each exercise sits in a superset, or null. A superset is a run of 2+ consecutive exercises with the same
 * key (the same rule the server uses), lettered A, B, C… in order.
 */
export function supersetSlots(exercises: { superset?: string | number | null }[]): (SupersetSlot | null)[] {
  const out: (SupersetSlot | null)[] = exercises.map(() => null);
  let group = 0;
  for (let i = 0; i < exercises.length; ) {
    const key = exercises[i].superset;
    let j = i + 1;
    if (key != null) while (j < exercises.length && exercises[j].superset === key) j++;
    if (j - i >= 2) {
      for (let k = i; k < j; k++) out[k] = { letter: String.fromCharCode(65 + (group % 26)), index: k - i, size: j - i, groupIndex: group };
      group++;
    }
    i = j;
  }
  return out;
}

/** Joins exercise `i` and the one after it into a superset (merging any superset either is already in). */
export function linkWithNext<T extends { superset?: string }>(exercises: T[], i: number): T[] {
  const a = exercises[i];
  const b = exercises[i + 1];
  if (!a || !b) return exercises;
  const key = a.superset ?? b.superset ?? uid();
  const merge = b.superset && b.superset !== key ? b.superset : null;
  return exercises.map((e, j) => (j === i || j === i + 1 || (merge && e.superset === merge) ? { ...e, superset: key } : e));
}

/** Breaks the link between exercise `i` and the one after it; each side keeps any other links. */
export function splitAfter<T extends { superset?: string }>(exercises: T[], i: number): T[] {
  const key = exercises[i]?.superset;
  if (!key || exercises[i + 1]?.superset !== key) return exercises;
  const fresh = uid();
  const out = [...exercises];
  for (let j = i + 1; j < out.length && out[j].superset === key; j++) out[j] = { ...out[j], superset: fresh };
  return out;
}

/** Takes exercise `i` out of its superset; the exercises after it stay together under a new key. */
export function unlink<T extends { superset?: string }>(exercises: T[], i: number): T[] {
  const key = exercises[i]?.superset;
  if (!key) return exercises;
  const fresh = uid();
  let after = false;
  return exercises.map((e, j) => {
    if (j === i) {
      after = true;
      return { ...e, superset: undefined };
    }
    if (after && e.superset === key) return { ...e, superset: fresh };
    if (after) after = false;
    return e;
  });
}

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
