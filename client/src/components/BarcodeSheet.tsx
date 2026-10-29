import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CameraOff, Keyboard, ScanBarcode } from 'lucide-react';
import { api, ApiError, type BarcodeLookup, type Meal } from '../lib/api';
import { createDetector, isValidGtin, scaleMacros } from '../lib/barcode';
import { fmtInt } from '../lib/format';
import { Badge, Button, Field, Input, Segmented, Sheet, useToast } from './ui';
import { fromDraft, guessMeal, ItemEditor, MEALS, type DraftItem } from './FoodForm';

const EMPTY: DraftItem = { name: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' };

/** Scan (or type) a barcode → product from the user's history or Open Food Facts → pick the amount → log. */
export function BarcodeSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [meal, setMeal] = useState<Meal>(guessMeal());

  const lookup = useMutation({
    mutationFn: (c: string) => api.get<BarcodeLookup>(`/food/barcode/${c}`),
  });

  const reset = () => {
    setCode(null);
    setTyped('');
    lookup.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const found = (c: string) => {
    navigator.vibrate?.(30);
    setCode(c);
    lookup.mutate(c);
  };

  const notFound = lookup.error instanceof ApiError && lookup.error.status === 404;
  const noFacts = lookup.data && !lookup.data.mine && !lookup.data.product?.per100g;
  const step = !code ? 'scan' : lookup.isPending ? 'loading' : notFound || noFacts ? 'manual' : lookup.data ? 'result' : 'error';

  const save = useMutation({
    mutationFn: (item: ReturnType<typeof fromDraft>) =>
      api.post('/food', { date, meal, source: 'barcode', items: [{ ...item, barcode: code }] }),
    onSuccess: (_, item) => {
      toast(`Added ${item.name}`);
      close();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <Sheet open={open} onClose={close} title={step === 'manual' ? 'Add this product' : 'Scan a barcode'}>
      {step === 'scan' && (
        <div className="flex flex-col gap-4">
          {open && <CameraScanner onCode={found} />}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (isValidGtin(typed)) found(typed);
            }}
          >
            <Field label="Or type the number under the barcode" className="flex-1" error={typed.length >= 8 && !isValidGtin(typed) ? 'That number doesn’t look like a valid barcode' : null}>
              {(id) => (
                <Input id={id} inputMode="numeric" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 14))} placeholder="e.g. 5000159484695" className="num" />
              )}
            </Field>
            <Button type="submit" variant="secondary" disabled={!isValidGtin(typed)} icon={<Keyboard className="size-4" aria-hidden />}>
              Look up
            </Button>
          </form>
        </div>
      )}

      {step === 'loading' && <p className="py-10 text-center text-muted">Looking up {code}…</p>}

      {step === 'error' && (
        <div className="flex flex-col gap-4">
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {lookup.error?.message}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={reset}>
              Scan again
            </Button>
            <Button className="flex-1" onClick={() => lookup.mutate(code!)}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {step === 'manual' && (
        <ManualProduct
          code={code!}
          name={lookup.data?.product?.name}
          meal={meal}
          setMeal={setMeal}
          saving={save.isPending}
          onSave={(d) => save.mutate(fromDraft(d))}
          onRescan={reset}
        />
      )}

      {step === 'result' && lookup.data && (
        <ProductPortion data={lookup.data} meal={meal} setMeal={setMeal} saving={save.isPending} onSave={(item) => save.mutate(item)} onRescan={reset} />
      )}
    </Sheet>
  );
}

function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // The camera starts once per mount; the latest callback is read through a ref so re-renders don't restart it.
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // A code has to be read twice in a row before it counts, which filters out partial misreads.
    let last = '';

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setError('This browser can’t use the camera here. Type the number instead.');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        return setError(denied ? 'Camera access was blocked. Allow it in your browser settings, or type the number instead.' : 'No camera found. Type the number instead.');
      }
      if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      const detector = await createDetector().catch(() => null);
      if (!detector) return setError('Barcode scanning isn’t available on this device. Type the number instead.');
      setReady(true);

      const tick = async () => {
        if (stopped || !video.current) return;
        if (video.current.readyState >= 2) {
          const codes = await detector.detect(video.current).catch(() => []);
          const hit = codes.map((c) => c.rawValue).find(isValidGtin);
          if (hit && hit === last) return onCodeRef.current(hit);
          last = hit ?? '';
        }
        timer = setTimeout(tick, 150);
      };
      tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 p-5 text-center text-sm text-muted">
        <CameraOff className="size-6" aria-hidden />
        {error}
      </div>
    );
  }
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line bg-black">
      <video ref={video} playsInline muted autoPlay className="size-full object-cover" aria-label="Camera preview for barcode scanning" />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-brand/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]">
        {ready && (
          <motion.span
            className="absolute inset-x-2 h-0.5 rounded-full bg-brand"
            initial={{ top: '10%' }}
            animate={{ top: '90%' }}
            transition={{ repeat: Infinity, repeatType: 'reverse', duration: 1.2, ease: 'easeInOut' }}
          />
        )}
      </div>
      <p className="absolute inset-x-0 bottom-2 text-center text-xs font-semibold text-white/80">
        {ready ? 'Hold the barcode inside the box' : 'Starting camera…'}
      </p>
    </div>
  );
}

type Mode = 'mine' | 'grams';

function ProductPortion({
  data,
  meal,
  setMeal,
  saving,
  onSave,
  onRescan,
}: {
  data: BarcodeLookup;
  meal: Meal;
  setMeal: (m: Meal) => void;
  saving: boolean;
  onSave: (item: ReturnType<typeof fromDraft>) => void;
  onRescan: () => void;
}) {
  const { product, mine } = data;
  const per100g = product?.per100g ?? null;
  const [mode, setMode] = useState<Mode>(mine ? 'mine' : 'grams');
  const [grams, setGrams] = useState(String(product?.serving?.grams ?? 100));
  const [servings, setServings] = useState('1');

  const g = Number(grams) || 0;
  const n = Number(servings) || 0;
  const item =
    mode === 'mine' && mine
      ? {
          ...mine,
          ...scaleMacros(mine, n),
          quantity: n === 1 ? mine.quantity : `${n} × ${mine.quantity ?? 'serving'}`,
        }
      : {
          name: product!.brand ? `${product!.name} (${product!.brand})` : product!.name,
          quantity: `${fmtInt(g)} g`,
          ...scaleMacros(per100g!, g / 100),
        };
  const amountOk = mode === 'mine' ? n > 0 : g > 0;

  const chips = [
    product?.serving && { label: `1 serving (${product.serving.label})`, grams: product.serving.grams },
    { label: '100 g', grams: 100 },
    product?.serving && { label: '2 servings', grams: product.serving.grams * 2 },
  ].filter(Boolean) as { label: string; grams: number }[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <ScanBarcode className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold leading-tight tracking-wide">{mode === 'mine' && mine ? mine.name : product?.name}</p>
          <p className="num text-xs text-muted">
            {product?.brand && `${product.brand} · `}
            {data.code}
          </p>
        </div>
      </div>

      {mine && per100g && (
        <Segmented
          label="Amount based on"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'mine', label: 'My last entry' },
            { value: 'grams', label: 'Pack (per 100 g)' },
          ]}
        />
      )}

      {mode === 'mine' && mine ? (
        <Field label={`Servings of ${mine.quantity ?? 'your last entry'}`} hint={`Last time: ${fmtInt(mine.calories)} kcal`}>
          {(id) => <Input id={id} inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} className="num" />}
        </Field>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Amount (g or ml)" hint={per100g ? `${per100g.calories} kcal per 100 g` : undefined}>
            {(id) => <Input id={id} inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} className="num" />}
          </Field>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setGrams(String(c.grams))}
                className="min-h-9 cursor-pointer rounded-lg border border-line-strong bg-surface-2 px-3 text-sm font-semibold hover:border-brand/50"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
        {(
          [
            ['kcal', item.calories, 'var(--color-fg)'],
            ['Protein', item.protein, 'var(--color-protein)'],
            ['Carbs', item.carbs, 'var(--color-carbs)'],
            ['Fat', item.fat, 'var(--color-fat)'],
          ] as const
        ).map(([label, v, color]) => (
          <div key={label}>
            <p className="num font-display text-2xl font-semibold" style={{ color }}>
              {Math.round(v)}
            </p>
            <p className="text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>

      {mode === 'grams' && <Badge tone="muted">Nutrition from Open Food Facts. Check it against the pack.</Badge>}

      <div>
        <p className="mb-1.5 text-sm font-medium text-muted">Log to</p>
        <Segmented label="Log to meal" value={meal} onChange={setMeal} options={MEALS} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRescan}>
          Rescan
        </Button>
        <Button className="flex-1" size="lg" disabled={!amountOk} loading={saving} onClick={() => onSave(item)}>
          Log {fmtInt(item.calories)} kcal
        </Button>
      </div>
    </div>
  );
}

function ManualProduct({
  code,
  name,
  meal,
  setMeal,
  saving,
  onSave,
  onRescan,
}: {
  code: string;
  name?: string;
  meal: Meal;
  setMeal: (m: Meal) => void;
  saving: boolean;
  onSave: (d: DraftItem) => void;
  onRescan: () => void;
}) {
  const [item, setItem] = useState<DraftItem>({ ...EMPTY, name: name ?? '' });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        {name ? `${name} has no nutrition facts in the database.` : `Barcode ${code} isn’t in the database yet.`} Enter it from the label once and
        your next scan will find it.
      </p>
      <ul>
        <ItemEditor item={item} onChange={setItem} onRemove={() => setItem(EMPTY)} />
      </ul>
      <div>
        <p className="mb-1.5 text-sm font-medium text-muted">Log to</p>
        <Segmented label="Log to meal" value={meal} onChange={setMeal} options={MEALS} />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRescan}>
          Rescan
        </Button>
        <Button className="flex-1" size="lg" disabled={!item.name.trim() || !item.calories} loading={saving} onClick={() => onSave(item)}>
          Save & log
        </Button>
      </div>
    </div>
  );
}
