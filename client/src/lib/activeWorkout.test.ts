import { describe, expect, it } from 'vitest';
import { linkWithNext, splitAfter, supersetSlots, unlink } from './activeWorkout';

const keys = (xs: { superset?: string }[]) => {
  // Compare grouping, not the random keys: same letter = same superset.
  const names = new Map<string, string>();
  return xs.map((x) => (x.superset ? (names.get(x.superset) ?? names.set(x.superset, String.fromCharCode(97 + names.size)).get(x.superset)) : '-')).join('');
};
const ex = (...s: (string | undefined)[]) => s.map((superset) => ({ superset }));

describe('supersetSlots', () => {
  it('letters runs of 2+ consecutive exercises and ignores singletons', () => {
    const slots = supersetSlots(ex('x', 'x', undefined, 'y', 'z', 'z', 'z'));
    expect(slots.map((s) => (s ? `${s.letter}${s.index + 1}/${s.size}` : '-'))).toEqual(['A1/2', 'A2/2', '-', '-', 'B1/3', 'B2/3', 'B3/3']);
    expect(slots[4]?.groupIndex).toBe(1);
  });
  it('treats the same key after a gap as a separate superset', () => {
    const slots = supersetSlots(ex('x', 'x', undefined, 'x', 'x'));
    expect(slots.map((s) => s?.letter ?? '-').join('')).toBe('AA-BB');
  });
  it('accepts server group numbers', () => {
    expect(supersetSlots([{ superset: 0 }, { superset: 0 }, { superset: null }]).map((s) => s?.letter ?? '-').join('')).toBe('AA-');
  });
});

describe('linking', () => {
  it('links two exercises, then extends the superset to a third', () => {
    let xs = linkWithNext(ex(undefined, undefined, undefined), 0);
    expect(keys(xs)).toBe('aa-');
    xs = linkWithNext(xs, 1);
    expect(keys(xs)).toBe('aaa');
  });
  it('merges two supersets when the boundary is linked', () => {
    expect(keys(linkWithNext(ex('x', 'x', 'y', 'y'), 1))).toBe('aaaa');
  });
  it('unlink removes one exercise and keeps the rest of the run together', () => {
    expect(keys(unlink(ex('x', 'x', 'x', 'x'), 1))).toBe('a-bb');
  });
  it('splitAfter breaks only the link after the given exercise', () => {
    expect(keys(splitAfter(ex('x', 'x', 'x', 'x'), 1))).toBe('aabb');
    expect(keys(splitAfter(ex('x', 'y'), 0))).toBe('ab');
  });
});
