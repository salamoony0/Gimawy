import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, isQueued, syncOutbox } from './api';
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
