import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, isQueued, syncOutbox } from './api';
import { workoutStore } from './activeWorkout';
import { outbox, setOutboxOwner } from './offline';

const ok = (body: unknown = {}, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  setOutboxOwner('user-a');
  for (const i of outbox.mine()) outbox.remove(i.id);
});
afterEach(() => vi.unstubAllGlobals());

describe('api.offline', () => {
  it('returns the response when online', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ id: 'w1' }, 201)));
    expect(await api.offline('POST', '/workouts', {}, 'Push')).toEqual({ id: 'w1' });
    expect(outbox.mine()).toHaveLength(0);
  });

  it('queues the write when the request never reaches the server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const res = await api.offline('POST', '/food', { items: [] }, 'Oats');
    expect(isQueued(res)).toBe(true);
    expect(outbox.mine()).toMatchObject([{ method: 'POST', path: '/food', label: 'Oats', owner: 'user-a' }]);
  });

  it('still throws HTTP errors instead of queueing them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ error: 'Invalid input' }, 400)));
    await expect(api.offline('POST', '/food', {}, 'Bad')).rejects.toThrow('Invalid input');
    expect(outbox.mine()).toHaveLength(0);
  });
});

describe('idempotency keys', () => {
  const keyOf = (call: unknown[]) => new Headers((call[1] as RequestInit).headers).get('Idempotency-Key');

  it('a queued POST is replayed with the key its first attempt used', async () => {
    const first = vi.fn(async () => Promise.reject(new TypeError('connection reset')));
    vi.stubGlobal('fetch', first);
    await api.offline('POST', '/food', { items: [] }, 'Oats');
    const replay = vi.fn(async () => ok({ created: 1 }, 201));
    vi.stubGlobal('fetch', replay);
    await syncOutbox();
    expect(keyOf(first.mock.calls[0])).toMatch(/.{16,}/);
    expect(keyOf(replay.mock.calls[0])).toBe(keyOf(first.mock.calls[0]));
  });

  it('every new POST gets its own key; PUT and PATCH need none', async () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetch);
    await api.offline('POST', '/food', {}, 'a');
    await api.offline('POST', '/food', {}, 'b');
    await api.offline('PUT', '/body/2026-10-01', {}, 'c');
    const keys = fetch.mock.calls.map(keyOf);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBeNull();
  });

  it('keeps an entry the server is still saving (409) for the next sync', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await api.offline('POST', '/food', {}, 'busy');
    vi.stubGlobal('fetch', vi.fn(async () => ok({ error: 'This entry is still being saved' }, 409)));
    expect(await syncOutbox()).toEqual({ sent: 0, failed: [] });
    expect(outbox.mine()).toHaveLength(1);
  });
});

describe('syncOutbox', () => {
  const queue = async (...labels: string[]) => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    for (const l of labels) await api.offline('POST', `/x/${l}`, {}, l);
  };

  it('sends in order, drops entries the server rejects and stops at the first network failure', async () => {
    await queue('one', 'two', 'three', 'four');
    const responses = [ok(), ok({ error: 'Unknown exercise' }, 400), Promise.reject(new TypeError('offline again'))];
    const fetch = vi.fn(async (_url: string) => responses.shift() ?? ok());
    vi.stubGlobal('fetch', fetch);

    expect(await syncOutbox()).toEqual({ sent: 1, failed: [{ label: 'two', message: 'Unknown exercise' }] });
    expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual(['/api/x/one', '/api/x/two', '/api/x/three']);
    expect(outbox.mine().map((i) => i.label)).toEqual(['three', 'four']);

    vi.stubGlobal('fetch', vi.fn(async () => ok()));
    expect((await syncOutbox()).sent).toBe(2);
    expect(outbox.mine()).toHaveLength(0);
  });

  it('keeps entries on 401 (signed out) and on server errors', async () => {
    await queue('a');
    vi.stubGlobal('fetch', vi.fn(async () => ok({ error: 'Sign in' }, 401)));
    expect((await syncOutbox()).sent).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => ok({}, 503)));
    expect((await syncOutbox()).sent).toBe(0);
    expect(outbox.mine()).toHaveLength(1);
  });

  it('only sends the signed-in account’s entries', async () => {
    await queue('mine');
    setOutboxOwner('user-b');
    expect(outbox.mine()).toHaveLength(0);
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetch);
    await syncOutbox();
    expect(fetch).not.toHaveBeenCalled();
    setOutboxOwner('user-a');
    expect(outbox.mine().map((i) => i.label)).toEqual(['mine']);
  });
});

describe('switching accounts on one device', () => {
  it('drops the unfinished workout when a different account signs in, keeps it for the same one', () => {
    setOutboxOwner('user-a');
    workoutStore.start('A’s legs');
    setOutboxOwner(null); // log out
    setOutboxOwner('user-a'); // and back in
    expect(workoutStore.get()?.name).toBe('A’s legs');
    setOutboxOwner(null);
    setOutboxOwner('user-b');
    expect(workoutStore.get()).toBeNull();
  });
});
