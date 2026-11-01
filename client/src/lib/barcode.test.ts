import { describe, expect, it } from 'vitest';
import { isValidGtin, lookupCode, scaleMacros, scaleQuantity } from './barcode';

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

describe('UPC-E', () => {
  it('accepts compressed UPC-E codes and looks them up by their UPC-A form', () => {
    expect(isValidGtin('04252614')).toBe(true); // Coca-Cola can, = 042100005264
    expect(lookupCode('04252614')).toBe('042100005264');
    // Also a valid EAN-8: typed, EAN-8 wins; scanned, the detector says which it is.
    expect(lookupCode('01234565')).toBe('01234565');
    expect(lookupCode('01234565', 'upc_e')).toBe('012345000065'); // last digit 5–9 rule
    expect(lookupCode('01234133')).toBe('012300000413'); // last digit 3 rule
    expect(lookupCode('01234543')).toBe('012340000053'); // last digit 4 rule
    expect(isValidGtin('04252615')).toBe(false);
  });

  it('leaves valid EAN-8 and longer codes alone', () => {
    expect(lookupCode('96385074')).toBe('96385074');
    expect(lookupCode('3017620422003')).toBe('3017620422003');
  });
});

describe('scaleQuantity', () => {
  it('multiplies an existing count instead of nesting it', () => {
    expect(scaleQuantity('1 pot (125 g)', 1)).toBe('1 pot (125 g)');
    expect(scaleQuantity('1 pot (125 g)', 2)).toBe('2 × 1 pot (125 g)');
    expect(scaleQuantity('2 × 1 pot (125 g)', 2)).toBe('4 × 1 pot (125 g)');
    expect(scaleQuantity('2 × 1 pot (125 g)', 0.5)).toBe('1 pot (125 g)');
    expect(scaleQuantity('1.5 × 1 pot', 3)).toBe('4.5 × 1 pot');
    expect(scaleQuantity(null, 2)).toBe('2 × serving');
  });

  it('never exceeds the 60-character limit the API enforces', () => {
    expect(scaleQuantity('x'.repeat(70), 2).length).toBeLessThanOrEqual(60);
  });
});
