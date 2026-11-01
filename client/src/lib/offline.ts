import { useSyncExternalStore } from 'react';
import { workoutStore } from './activeWorkout';

/**
 * Offline outbox. Logging calls made through `api.offline()` that fail because there's no connection are kept
 * here (localStorage) and replayed in order once the device is back online. Only creates and full replacements
 * are queued (workouts, food, cardio, weigh-ins), so replaying is safe; the server also answers a repeated
 * workout save with the one it already has.
 *
 * Each entry remembers which account queued it and is only sent while that account is signed in.
 */
/** `key`: the Idempotency-Key a queued POST was first sent with (entries queued before keys existed have none). */
export type Outgoing = { id: string; owner: string; method: 'POST' | 'PUT' | 'PATCH'; path: string; body: unknown; label: string; at: number; key?: string };

const KEY = 'gymawy.outbox';
const OWNER_KEY = 'gymawy.cacheOwner';
export const API_CACHE = 'gymawy-api';

const listeners = new Set<() => void>();
let owner: string | null = null;

function read(): Outgoing[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Outgoing[];
  } catch {
    return [];
  }
}

let items: Outgoing[] = read();
// The signed-in account's entries, recomputed on every change so React sees a new array only when it changes.
let mine: Outgoing[] = [];
const recompute = () => (mine = items.filter((i) => i.owner === owner));

function write(next: Outgoing[]) {
  items = next;
  recompute();
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable: keep the in-memory copy for this session
  }
  listeners.forEach((l) => l());
}

export const outbox = {
  mine: () => mine,
  add(entry: Omit<Outgoing, 'id' | 'owner' | 'at'>) {
    if (!owner) throw new Error('Not signed in');
    write([...items, { ...entry, id: Math.random().toString(36).slice(2), owner, at: Date.now() }]);
  },
  remove(id: string) {
    write(items.filter((i) => i.id !== id));
  },
};

/**
 * Sets the signed-in account (null when signed out). Cached API responses and the unfinished workout belong to
 * one account, so they're dropped when a different account signs in on this device (signing back in keeps them).
 */
export function setOutboxOwner(id: string | null) {
  owner = id;
  recompute();
  listeners.forEach((l) => l());
  if (!id || readOwner() === id) return;
  void clearApiCache();
  workoutStore.discard();
  lastOwner = id;
  try {
    localStorage.setItem(OWNER_KEY, id);
  } catch {
    // storage unavailable: lastOwner covers this session
  }
}

let lastOwner: string | null = null;
function readOwner() {
  try {
    return localStorage.getItem(OWNER_KEY) ?? lastOwner;
  } catch {
    return lastOwner;
  }
}

export async function clearApiCache() {
  try {
    await caches?.delete(API_CACHE);
  } catch {
    // Cache Storage unavailable (e.g. insecure context)
  }
}

/** A fetch that never reached the server (offline, DNS, connection reset) as opposed to an HTTP error. */
export const isNetworkError = (e: unknown) => e instanceof TypeError;

let onlineState = typeof navigator === 'undefined' ? true : navigator.onLine;
if (typeof window !== 'undefined') {
  const update = () => {
    onlineState = navigator.onLine;
    listeners.forEach((l) => l());
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The signed-in account's pending entries. */
export function useOutbox() {
  return useSyncExternalStore(subscribe, () => mine);
}

export function useOnline() {
  return useSyncExternalStore(subscribe, () => onlineState);
}
