import { describe, expect, it } from 'vitest';
import { isValidGtin, scaleMacros } from './barcode';

describe('isValidGtin', () => {
  it('accepts real EAN-13, EAN-8 and UPC-A codes', () => {
    expect(isValidGtin('3017620422003')).toBe(true); // EAN-13
    expect(isValidGtin('96385074')).toBe(true); // EAN-8
    expect(isValidGtin('036000291452')).toBe(true); // UPC-A
  });
  it('rejects a wrong check digit, wrong lengths and non-digits', () => {
    expect(isValidGtin('3017620422004')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);
    expect(isValidGtin('30176204220a3')).toBe(false);
  });
});

describe('scaleMacros', () => {
  it('scales per-100 g facts to a portion', () => {
    expect(scaleMacros({ calories: 372, protein: 13.5, carbs: 58.7, fat: 7 }, 0.4)).toEqual({ calories: 149, protein: 5.4, carbs: 23.5, fat: 2.8 });
  });
});
