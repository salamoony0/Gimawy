/**
 * Barcode scanning: the browser's own BarcodeDetector where it exists (Chrome on Android, macOS), otherwise the
 * zxing-wasm ponyfill (iPhone Safari). The wasm file is bundled with the app and only downloaded on first scan.
 */
import type { FoodItem } from './api';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string; format?: string }[]> };

type NativeDetectorClass = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

export async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.length) return new Native({ formats });
    } catch {
      // fall through to the ponyfill
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

/** GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14). */
function checkDigitOk(code: string) {
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const total = digits.reverse().reduce((n, d, i) => n + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10 === check;
}

/** A UPC-E code (8 digits, number system 0 or 1) expanded to the 12-digit UPC-A it stands for; null if it isn't one. */
function expandUpcE(code: string) {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [s, d1, d2, d3, d4, d5, d6, c] = code;
  const body =
    d6 <= '2' ? `${d1}${d2}${d6}0000${d3}${d4}${d5}` : d6 === '3' ? `${d1}${d2}${d3}00000${d4}${d5}` : d6 === '4' ? `${d1}${d2}${d3}${d4}00000${d5}` : `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  const upcA = `${s}${body}${c}`; // UPC-E shares its check digit with the UPC-A form
  return checkDigitOk(upcA) ? upcA : null;
}

/** Rejects misreads before they hit the lookup. 8-digit codes may be EAN-8 or UPC-E (small US packs). */
export function isValidGtin(code: string) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  return checkDigitOk(code) || expandUpcE(code) !== null;
}

/**
 * The code to look up and store: UPC-E becomes UPC-A (how Open Food Facts lists it). An 8-digit code can pass both
 * checks; the scanner's `format` settles it, and a typed one is taken as EAN-8.
 */
export function lookupCode(code: string, format?: string) {
  if (code.length !== 8 || (format !== 'upc_e' && checkDigitOk(code))) return code;
  return expandUpcE(code) ?? code;
}

/** "n ×" an amount, multiplying a count that's already there ("2 × 1 pot" × 2 → "4 × 1 pot"); ≤ 60 chars like the API. */
export function scaleQuantity(quantity: string | null | undefined, n: number) {
  const m = /^(\d+(?:\.\d+)?) × (.+)$/.exec(quantity ?? '');
  const count = Math.round((m ? Number(m[1]) : 1) * n * 100) / 100;
  const base = m ? m[2] : (quantity ?? 'serving');
  return (count === 1 ? base : `${count} × ${base}`).slice(0, 60);
}

export type Macros = Pick<FoodItem, 'calories' | 'protein' | 'carbs' | 'fat'>;

/** Macros for `factor` × the base amount (e.g. grams / 100 for per-100 g facts). kcal whole, macros to 0.1 g. */
export function scaleMacros(m: Macros, factor: number): Macros {
  const r1 = (n: number) => Math.round(n * factor * 10) / 10;
  return { calories: Math.round(m.calories * factor), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) };
}
