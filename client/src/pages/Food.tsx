import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Info,
  Pencil,
  Plus,
  ScanBarcode,
  ScanLine,
  Sparkles,
  Trash,
  X,
} from 'lucide-react';
import { api, isQueued, type FoodAnalysis, type FoodEntry, type FoodItem, type FoodSource, type Meal, type User } from '../lib/api';
import { fmtCompact, fmtDay, fmtInt, localDay, relativeDay, shiftDay, useMe } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Badge, Button, Field, IconButton, Input, Segmented, Sheet, Skeleton, useToast } from '../components/ui';
import { axisProps, ChartTooltip, gridProps, Rings } from '../components/viz';
import { BarcodeSheet } from '../components/BarcodeSheet';
import { fromDraft, guessMeal, ItemEditor, MEALS, sum, toDraft, type DraftItem } from '../components/FoodForm';

const SOURCE_LABEL: Record<FoodSource, string> = {
  manual: 'Manual',
  label: 'AI · label',
  screenshot: 'AI · screenshot',
  photo: 'AI · photo',
  text: 'AI · text',
  barcode: 'Barcode',
};

export default function Food() {
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(localDay());
  const [scanOpen, setScanOpen] = useState(params.get('scan') === '1');
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [manualMeal, setManualMeal] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const { data: me } = useMe();
  const toast = useToast();

  useEffect(() => {
    if (params.get('scan')) setParams({}, { replace: true });
  }, [params, setParams]);

  const { data: entries } = useQuery({ queryKey: ['food', date], queryFn: () => api.get<FoodEntry[]>(`/food?date=${date}`) });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/food/${id}`), onSuccess: () => toast('Removed') });

  const isToday = date === localDay();
  const totals = {
    calories: sum(entries ?? [], 'calories'),
    protein: sum(entries ?? [], 'protein'),
    carbs: sum(entries ?? [], 'carbs'),
    fat: sum(entries ?? [], 'fat'),
  };

  return (
    <>
      <PageHeader
        eyebrow="Nutrition"
        title="Food"
        action={
          <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface p-1">
            <IconButton label="Previous day" onClick={() => setDate(shiftDay(date, -1))}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <span className="min-w-28 text-center font-semibold">{relativeDay(date)}</span>
            <IconButton label="Next day" disabled={isToday} onClick={() => setDate(shiftDay(date, 1))}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-5">
          {me && <DaySummary totals={totals} me={me} />}

          {/* AI scan call-to-action */}
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="glow group relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-[var(--radius-card)] border border-brand/40 p-5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />
            <span className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-on-brand shadow-lg shadow-brand/20">
              <ScanLine className="size-7" aria-hidden />
            </span>
            <span className="relative flex-1">
              <span className="flex items-center gap-2 font-display text-2xl font-semibold tracking-wide">
                Scan a meal <Sparkles className="size-4 text-brand" aria-hidden />
              </span>
              <span className="text-sm text-muted">Photo, nutrition label or app screenshot. AI fills in the macros.</span>
            </span>
            <ChevronRight className="relative size-5 text-brand transition-transform group-hover:translate-x-1" aria-hidden />
          </button>
          <Button variant="secondary" size="lg" icon={<ScanBarcode className="size-5" aria-hidden />} onClick={() => setBarcodeOpen(true)} className="-mt-2">
            Scan a barcode
          </Button>

          {/* Meals */}
          {!entries ? (
            <Skeleton className="h-64" />
          ) : (
            MEALS.map(({ value, label }) => {
              const items = entries.filter((e) => e.meal === value);
              return (
                <section key={value} className="card p-0">
                  <div className="flex items-center justify-between px-4 pt-3">
                    <h2 className="font-display text-xl font-semibold tracking-wide">{label}</h2>
                    <div className="flex items-center gap-1">
                      <span className="num text-sm font-semibold text-muted">{fmtInt(sum(items, 'calories'))} kcal</span>
                      <IconButton label={`Add food to ${label}`} onClick={() => setManualMeal(value)} className="text-brand">
                        <Plus className="size-5" />
                      </IconButton>
                    </div>
                  </div>
                  {items.length ? (
                    <ul className="pb-2">
                      <AnimatePresence initial={false}>
                        {items.map((it) => (
                          <motion.li
                            key={it.id}
                            layout
                            exit={{ opacity: 0, height: 0 }}
                            className="group flex items-center gap-3 border-t border-line/60 px-4 py-2.5"
                          >
                            <button
                              type="button"
                              onClick={() => setEditing(it)}
                              aria-label={`Edit ${it.name}`}
                              className="min-w-0 flex-1 cursor-pointer text-left"
                            >
                              <span className="flex items-center gap-2">
                                <span className="truncate font-medium">{it.name}</span>
                                {it.source !== 'manual' && (
                                  <span title={SOURCE_LABEL[it.source]} className="text-brand">
                                    {it.source === 'barcode' ? (
                                      <ScanBarcode className="size-3.5" aria-label={SOURCE_LABEL[it.source]} />
                                    ) : (
                                      <Sparkles className="size-3.5" aria-label={SOURCE_LABEL[it.source]} />
                                    )}
                                  </span>
                                )}
                              </span>
                              <span className="num block text-xs text-muted">
                                {it.quantity && `${it.quantity} · `}
                                <span className="text-protein">P {Math.round(it.protein)}</span> ·{' '}
                                <span className="text-carbs">C {Math.round(it.carbs)}</span> · <span className="text-fat">F {Math.round(it.fat)}</span>
                              </span>
                            </button>
                            <span className="num font-semibold">{fmtInt(it.calories)}</span>
                            <IconButton label={`Remove ${it.name}`} onClick={() => del.mutate(it.id)} className="-mr-2 size-9 opacity-50 group-hover:opacity-100">
                              <Trash className="size-4" />
                            </IconButton>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setManualMeal(value)}
                      className="mx-4 mb-4 mt-2 flex min-h-11 w-[calc(100%-2rem)] cursor-pointer items-center justify-center rounded-xl border border-dashed border-line-strong text-sm text-subtle hover:border-brand/40 hover:text-muted"
                    >
                      Nothing logged · tap to add
                    </button>
                  )}
                </section>
              );
            })
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <TrendCard date={date} me={me} />
        </aside>
      </div>

      <BarcodeSheet open={barcodeOpen} onClose={() => setBarcodeOpen(false)} date={date} />
      <ScanSheet open={scanOpen} onClose={() => setScanOpen(false)} date={date} />
      <ManualSheet meal={manualMeal} onClose={() => setManualMeal(null)} date={date} />
      <EditFoodSheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function DaySummary({ totals, me }: { totals: Record<'calories' | 'protein' | 'carbs' | 'fat', number>; me: User }) {
  const left = me.calorieTarget - totals.calories;
  const macroKcal = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9 || 1;
  const macros = [
    { key: 'protein', label: 'Protein', value: totals.protein, target: me.proteinTarget, color: 'var(--color-protein)', kcal: totals.protein * 4 },
    { key: 'carbs', label: 'Carbs', value: totals.carbs, target: me.carbsTarget, color: 'var(--color-carbs)', kcal: totals.carbs * 4 },
    { key: 'fat', label: 'Fat', value: totals.fat, target: me.fatTarget, color: 'var(--color-fat)', kcal: totals.fat * 9 },
  ];
  return (
    <section className="card p-5">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <Rings
          size={168}
          stroke={12}
          gap={5}
          label={`Protein ${Math.round(totals.protein)} of ${me.proteinTarget} grams, carbs ${Math.round(totals.carbs)} of ${me.carbsTarget}, fat ${Math.round(totals.fat)} of ${me.fatTarget}`}
          rings={macros.map((m) => ({ value: m.value / m.target, color: m.color, label: m.label }))}
        >
          <span className="num font-display text-3xl font-bold leading-none">{fmtInt(totals.calories)}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">kcal eaten</span>
        </Rings>
        <div className="w-full flex-1">
          <div className="flex items-baseline justify-between">
            <span className="label">Remaining</span>
            <span className={clsx('num font-display text-3xl font-semibold', left < 0 && 'text-carbs')}>
              {fmtInt(Math.abs(left))} <span className="text-sm text-muted">{left < 0 ? 'kcal over' : 'kcal'}</span>
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {macros.map((m) => (
              <div key={m.key} className="rounded-xl bg-surface-2 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <span className="size-2 rounded-full" style={{ background: m.color }} />
                  {m.label}
                </p>
                <p className="num mt-1 font-display text-2xl font-semibold leading-none">
                  {Math.round(m.value)}
                  <span className="text-xs text-muted">/{m.target}g</span>
                </p>
              </div>
            ))}
          </div>
          {/* Calorie split by macro */}
          <div className="mt-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label="Share of calories from each macro">
              {macros.map((m) => (
                <motion.span
                  key={m.key}
                  initial={{ width: 0 }}
                  animate={{ width: `${(m.kcal / macroKcal) * 100}%` }}
                  transition={{ duration: 0.7 }}
                  style={{ background: m.color }}
                />
              ))}
            </div>
            <p className="num mt-1.5 flex justify-between text-[11px] text-muted">
              {macros.map((m) => (
                <span key={m.key}>
                  {m.label} {Math.round((m.kcal / macroKcal) * 100)}%
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrendCard({ date, me }: { date: string; me?: User }) {
  const from = shiftDay(date, -13);
  const { data } = useQuery({
    queryKey: ['food-summary', from, date],
    queryFn: () => api.get<{ date: string; calories: number; protein: number }[]>(`/food/summary?from=${from}&to=${date}`),
  });
  const rows = Array.from({ length: 14 }, (_, i) => {
    const d = shiftDay(from, i);
    const hit = data?.find((r) => r.date === d);
    return { date: d, calories: hit?.calories ?? 0, protein: hit?.protein ?? 0 };
  });
  const logged = rows.filter((r) => r.calories > 0);
  const avg = logged.length ? Math.round(logged.reduce((n, r) => n + r.calories, 0) / logged.length) : 0;
  const avgP = logged.length ? Math.round(logged.reduce((n, r) => n + r.protein, 0) / logged.length) : 0;

  return (
    <section className="card p-5 lg:sticky lg:top-10">
      <h2 className="font-display text-xl font-semibold tracking-wide">Last 14 days</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="label">Avg kcal</p>
          <p className="num font-display text-2xl font-semibold">{fmtInt(avg)}</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="label">Avg protein</p>
          <p className="num font-display text-2xl font-semibold">
            {avgP}
            <span className="text-sm text-muted">g</span>
          </p>
        </div>
      </div>
      <div className="mt-4 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDay(d, { weekday: 'narrow' })} />
            <YAxis {...axisProps} width={44} tickFormatter={fmtCompact} />
            <Tooltip cursor={{ fill: 'var(--color-surface-3)' }} content={<ChartTooltip labelFormat={(d) => fmtDay(d)} format={(v) => `${fmtInt(v)} kcal`} />} />
            {me && <ReferenceLine y={me.calorieTarget} stroke="var(--color-brand)" strokeDasharray="4 4" strokeOpacity={0.7} />}
            <Bar dataKey="calories" name="Calories" fill="var(--color-brand-strong)" radius={[4, 4, 1, 1]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h3 className="label mt-5">Protein (g)</h3>
      <div className="mt-2 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis {...axisProps} width={44} />
            <Tooltip content={<ChartTooltip labelFormat={(d) => fmtDay(d)} format={(v) => `${v} g`} />} />
            {me && <ReferenceLine y={me.proteinTarget} stroke="var(--color-protein)" strokeDasharray="4 4" strokeOpacity={0.5} />}
            <Line type="monotone" dataKey="protein" name="Protein" stroke="var(--color-protein)" strokeWidth={2} dot={{ r: 2.5, fill: 'var(--color-protein)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ---------- AI scan ----------

/** Downscale to keep uploads fast and token usage low. Falls back to the original if the browser can't decode it. */
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

function ScanSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const toast = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [meal, setMeal] = useState<Meal>(guessMeal());
  const [result, setResult] = useState<FoodAnalysis | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const { data: status } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<{ enabled: boolean }>('/ai/status'),
    enabled: open,
  });

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setFile(null);
    setHint('');
    setResult(null);
    setItems([]);
    analyze.reset();
  }

  const analyze = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      if (file) form.append('image', await compress(file), 'meal.jpg');
      if (hint.trim()) form.append('hint', hint.trim());
      return api.post<FoodAnalysis>('/ai/analyze-food', form);
    },
    onSuccess: (r) => {
      setResult(r);
      setItems(r.items.map(toDraft));
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api.offline('POST', '/food', { date, meal, source: result?.source ?? 'photo', items: items.map(fromDraft) }, result?.mealName || 'Scanned meal'),
    onSuccess: (res) => {
      toast(isQueued(res) ? 'No connection. Saved on this device, it will sync automatically.' : `Added ${items.length} item${items.length === 1 ? '' : 's'} to ${meal}`);
      reset();
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const draftTotals = items.map(fromDraft);
  const step = result ? 'review' : 'input';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step === 'review' ? 'Review & log' : 'Scan a meal'}
      footer={
        step === 'review' ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset}>
              Rescan
            </Button>
            <Button className="flex-1" size="lg" disabled={!items.length} loading={save.isPending} onClick={() => save.mutate()}>
              Log {fmtInt(sum(draftTotals, 'calories'))} kcal
            </Button>
          </div>
        ) : (
          <Button
            className="w-full"
            size="lg"
            icon={<Sparkles className="size-4" aria-hidden />}
            disabled={(!file && !hint.trim()) || status?.enabled === false}
            loading={analyze.isPending}
            onClick={() => analyze.mutate()}
          >
            {analyze.isPending ? 'Analyzing…' : 'Analyze with AI'}
          </Button>
        )
      }
    >
      {step === 'input' ? (
        <div className="flex flex-col gap-4">
          {status?.enabled === false && (
            <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                AI scanning needs a free Gemini key. Get one at <span className="font-semibold">aistudio.google.com/apikey</span>, set{' '}
                <code className="rounded bg-black/30 px-1">GEMINI_API_KEY</code> in <code className="rounded bg-black/30 px-1">server/.env</code> and restart the server.
              </p>
            </div>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

          {preview ? (
            <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
              <img src={preview} alt="Selected meal" className="max-h-72 w-full object-contain" />
              {analyze.isPending && (
                <>
                  <div className="absolute inset-0 bg-brand/10" />
                  <motion.div
                    className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-brand/40 to-transparent"
                    initial={{ top: '-25%' }}
                    animate={{ top: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                  />
                </>
              )}
              {!analyze.isPending && (
                <IconButton label="Remove image" onClick={() => setFile(null)} className="absolute right-2 top-2 bg-black/60 text-fg backdrop-blur">
                  <X className="size-5" />
                </IconButton>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-brand/40 bg-brand/8 text-brand transition-colors hover:bg-brand/12"
              >
                <Camera className="size-7" aria-hidden />
                <span className="font-semibold">Take photo</span>
              </button>
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface-2 text-fg transition-colors hover:border-brand/40"
              >
                <ImageIcon className="size-7 text-muted" aria-hidden />
                <span className="font-semibold">Upload image</span>
                <span className="text-xs text-muted">Screenshot or label</span>
              </button>
            </div>
          )}

          <Field label={file ? 'Anything to add? (optional)' : 'Or describe your meal'} hint="e.g. “2 servings”, “I ate half”, “200g chicken with rice”">
            {(id) => <Input id={id} value={hint} onChange={(e) => setHint(e.target.value)} placeholder={file ? 'Optional notes' : '3 eggs, 2 toast, a coffee with milk'} />}
          </Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-muted">Meal</p>
            <Segmented label="Meal" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.value, label: m.label }))} />
          </div>

          {analyze.error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {analyze.error.message}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              <Sparkles className="size-3" aria-hidden /> {result!.mealName || 'Meal'}
            </Badge>
            <Badge tone={result!.confidence === 'high' ? 'brand' : 'muted'}>{result!.confidence} confidence</Badge>
            <Badge tone="muted">{SOURCE_LABEL[result!.source]}</Badge>
          </div>
          {result!.notes && <p className="text-sm text-muted">{result!.notes}</p>}
          {result!.confidence !== 'high' && (
            <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              <Pencil className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Portions were estimated. Tap any number to correct it before logging.
            </p>
          )}

          <div className="grid grid-cols-4 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
            {(
              [
                ['kcal', sum(draftTotals, 'calories'), 'var(--color-fg)'],
                ['Protein', sum(draftTotals, 'protein'), 'var(--color-protein)'],
                ['Carbs', sum(draftTotals, 'carbs'), 'var(--color-carbs)'],
                ['Fat', sum(draftTotals, 'fat'), 'var(--color-fat)'],
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

          {!items.length && <p className="py-4 text-center text-sm text-muted">No food found. Add items manually or rescan.</p>}

          <ul className="flex flex-col gap-3">
            {items.map((it, i) => (
              <ItemEditor
                key={i}
                item={it}
                onChange={(next) => setItems((xs) => xs.map((x, j) => (j === i ? next : x)))}
                onRemove={() => setItems((xs) => xs.filter((_, j) => j !== i))}
              />
            ))}
          </ul>
          <Button
            variant="ghost"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => setItems((xs) => [...xs, { name: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' }])}
          >
            Add item
          </Button>
          <div>
            <p className="mb-1.5 text-sm font-medium text-muted">Log to</p>
            <Segmented label="Log to meal" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.value, label: m.label }))} />
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Manual add ----------

function ManualSheet({ meal, onClose, date }: { meal: Meal | null; onClose: () => void; date: string }) {
  const toast = useToast();
  const [item, setItem] = useState<DraftItem>({ name: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' });
  const { data: recent } = useQuery({
    queryKey: ['food-recent'],
    queryFn: () => api.get<(FoodItem & { count: number })[]>('/food/recent'),
    enabled: meal !== null,
  });
  const save = useMutation({
    mutationFn: (items: FoodItem[]) => api.offline('POST', '/food', { date, meal, source: 'manual', items }, items[0].name),
    onSuccess: (res, items) => {
      toast(isQueued(res) ? `${items[0].name} saved on this device, it will sync automatically.` : `Added ${items[0].name}`);
      setItem({ name: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' });
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const label = MEALS.find((m) => m.value === meal)?.label ?? '';

  return (
    <Sheet
      open={meal !== null}
      onClose={onClose}
      title={`Add to ${label}`}
      footer={
        <Button className="w-full" size="lg" disabled={!item.name.trim() || !item.calories} loading={save.isPending} onClick={() => save.mutate([fromDraft(item)])}>
          Add food
        </Button>
      }
    >
      {recent && recent.length > 0 && (
        <div className="mb-5">
          <p className="label mb-2">Quick add</p>
          <ul className="flex flex-col gap-1.5">
            {recent.slice(0, 6).map((r) => (
              <li key={r.name}>
                <button
                  type="button"
                  onClick={() => save.mutate([r])}
                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl bg-surface-2 px-3 text-left transition-colors hover:bg-surface-3"
                >
                  <Plus className="size-4 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.name}</span>
                    <span className="num text-xs text-muted">
                      {r.quantity} · P {Math.round(r.protein)} · C {Math.round(r.carbs)} · F {Math.round(r.fat)}
                    </span>
                  </span>
                  <span className="num text-sm font-semibold">{fmtInt(r.calories)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="label mb-2">New food</p>
      <ul>
        <ItemEditor item={item} onChange={setItem} onRemove={() => setItem({ name: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' })} />
      </ul>
    </Sheet>
  );
}

// ---------- Edit entry ----------

function EditFoodSheet({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const toast = useToast();
  const [item, setItem] = useState<DraftItem | null>(null);
  const [meal, setMeal] = useState<Meal>('breakfast');
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Load the entry into the form whenever a different one is opened.
  if (entry && entry.id !== loadedId) {
    setLoadedId(entry.id);
    setItem(toDraft(entry));
    setMeal(entry.meal);
  }

  const save = useMutation({
    mutationFn: () => api.offline('PATCH', `/food/${entry!.id}`, { ...fromDraft(item!), meal }, fromDraft(item!).name),
    onSuccess: (res) => {
      toast(isQueued(res) ? 'Saved on this device, it will sync automatically.' : 'Entry updated');
      setLoadedId(null);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <Sheet
      open={entry !== null}
      onClose={() => {
        setLoadedId(null);
        onClose();
      }}
      title="Edit food"
      footer={
        <Button className="w-full" size="lg" disabled={!item?.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
      }
    >
      {item && (
        <div className="flex flex-col gap-4">
          {entry && entry.source !== 'manual' && (
            <p className="flex items-center gap-2 text-xs text-muted">
              {entry.source === 'barcode' ? <ScanBarcode className="size-3.5 text-brand" aria-hidden /> : <Sparkles className="size-3.5 text-brand" aria-hidden />}
              {entry.source === 'barcode' ? 'Logged from a barcode. Fixing it here also updates what your next scan finds.' : `Logged with ${SOURCE_LABEL[entry.source]}`}
            </p>
          )}
          <ul>
            <ItemEditor item={item} onChange={setItem} onRemove={() => setItem({ ...item, name: '' })} />
          </ul>
          <div>
            <p className="mb-1.5 text-sm font-medium text-muted">Meal</p>
            <Segmented label="Meal" value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.value, label: m.label }))} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
