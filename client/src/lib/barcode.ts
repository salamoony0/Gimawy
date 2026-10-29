/**
 * Barcode scanning: the browser's own BarcodeDetector where it exists (Chrome on Android, macOS), otherwise the
 * zxing-wasm ponyfill (iPhone Safari). The wasm file is bundled with the app and only downloaded on first scan.
 */
import type { FoodItem } from './api';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

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

/** GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14): rejects misreads before they hit the lookup. */
export function isValidGtin(code: string) {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const total = digits.reverse().reduce((n, d, i) => n + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (total % 10)) % 10 === check;
}

export type Macros = Pick<FoodItem, 'calories' | 'protein' | 'carbs' | 'fat'>;

/** Macros for `factor` × the base amount (e.g. grams / 100 for per-100 g facts). kcal whole, macros to 0.1 g. */
export function scaleMacros(m: Macros, factor: number): Macros {
  const r1 = (n: number) => Math.round(n * factor * 10) / 10;
  return { calories: Math.round(m.calories * factor), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) };
}
