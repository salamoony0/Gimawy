import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { clsx } from 'clsx';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  Bike,
  ChevronRight,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Mountain,
  Pencil,
  Play,
  Plus,
  Search,
  Trash,
  Trophy,
  Waves,
  Zap,
} from 'lucide-react';
import { api, type CardioSession, type CardioType, type Routine, type WorkoutSummary } from '../lib/api';
import { fmtCompact, fmtDay, fmtDuration, localDay, MUSCLE_LABEL, relativeDay, shiftDay, useMe, useUnits } from '../lib/format';
import { BURN_METHOD_LABEL, estimateCardio, profileFor } from '../lib/energy';
import { PageHeader } from '../components/Layout';
import { Badge, Button, buttonClass, EmptyState, Field, IconButton, Input, Segmented, Select, Sheet, Skeleton, useToast } from '../components/ui';
import { axisProps, ChartTooltip, gridProps } from '../components/viz';
import { useExercises } from '../components/ExercisePicker';
import { RoutineEditor } from '../components/RoutineEditor';

type Tab = 'strength' | 'cardio' | 'exercises';

export default function Train() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'strength';
  return (
    <>
      <PageHeader
        eyebrow="Training"
        title="Train"
        action={
          <Link to="/train/log" className={buttonClass('primary', 'md', 'hidden sm:inline-flex')}>
            <Play className="size-4 fill-current" aria-hidden /> Start workout
          </Link>
        }
      />
      <Segmented
        label="Training section"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        options={[
          { value: 'strength', label: 'Strength' },
          { value: 'cardio', label: 'Cardio' },
          { value: 'exercises', label: 'Exercises' },
        ]}
        className="mb-6 max-w-md"
      />
      {tab === 'strength' && <Strength />}
      {tab === 'cardio' && <Cardio />}
      {tab === 'exercises' && <Exercises />}
    </>
  );
}

// ---------- Strength ----------

function Strength() {
  const u = useUnits();
  const toast = useToast();
  const { data: workouts } = useQuery({ queryKey: ['workouts'], queryFn: () => api.get<WorkoutSummary[]>('/workouts') });
  const { data: routines } = useQuery({ queryKey: ['routines'], queryFn: () => api.get<Routine[]>('/routines') });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/routines/${id}`),
    onSuccess: () => toast('Routine deleted'),
  });
  const [routineEdit, setRoutineEdit] = useState<{ routine: Routine | null } | null>(null);

  const months = useMemo(() => {
    const groups = new Map<string, WorkoutSummary[]>();
    for (const w of workouts ?? []) {
      const key = w.date.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), w]);
    }
    return [...groups.entries()];
  }, [workouts]);

  return (
    <div className="flex flex-col gap-8">
      <Link
        to="/train/log"
        className="glow flex items-center gap-4 rounded-[var(--radius-card)] border border-brand/40 p-4 sm:hidden"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand text-on-brand">
          <Play className="size-5 fill-current" aria-hidden />
        </span>
        <span className="flex-1 font-display text-xl font-semibold tracking-wide">Start workout</span>
        <ChevronRight className="size-5 text-brand" aria-hidden />
      </Link>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold tracking-wide">Routines</h2>
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setRoutineEdit({ routine: null })}>
            New routine
          </Button>
        </div>
        {routines?.length ? (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
            {routines.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card flex w-64 shrink-0 snap-start flex-col p-4 sm:w-auto"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-xl font-semibold tracking-wide">{r.name}</h3>
                  <div className="-mr-2 -mt-2 flex">
                    <IconButton label={`Edit routine ${r.name}`} className="size-9" onClick={() => setRoutineEdit({ routine: r })}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label={`Delete routine ${r.name}`} className="size-9" onClick={() => del.mutate(r.id)}>
                      <Trash className="size-4" />
                    </IconButton>
                  </div>
                </div>
                <ul className="mt-1 flex-1 text-sm text-muted">
                  {r.exercises.slice(0, 4).map((e) => (
                    <li key={e.exerciseId} className="truncate">
                      {e.targetSets} × {e.name}
                    </li>
                  ))}
                  {r.exercises.length > 4 && <li className="text-subtle">+{r.exercises.length - 4} more</li>}
                </ul>
                <Link to={`/train/log?routine=${r.id}`} className={buttonClass('secondary', 'sm', 'mt-3')}>
                  <Play className="size-3.5 fill-current" aria-hidden /> Start
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Create one here, or finish a workout and tick “Save as routine”.</p>
        )}
        <RoutineEditor open={routineEdit !== null} routine={routineEdit?.routine ?? null} onClose={() => setRoutineEdit(null)} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">History</h2>
        {!workouts ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : !workouts.length ? (
          <EmptyState
            icon={<Dumbbell className="size-5" />}
            title="No workouts yet"
            body="Your logged sessions, PRs and volume will appear here."
            action={
              <Link to="/train/log" className={buttonClass()}>
                Log first workout
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {months.map(([month, ws]) => (
              <div key={month}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="label">{fmtDay(`${month}-01`, { month: 'long', year: 'numeric' })}</h3>
                  <span className="num text-xs text-muted">
                    {ws.length} workouts · {fmtCompact(u.weight(ws.reduce((n, w) => n + w.volume, 0), 0))} {u.w}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {ws.map((w) => (
                    <li key={w.id}>
                      <Link
                        to={`/train/workouts/${w.id}`}
                        className="card flex items-center gap-4 p-4 transition-colors hover:border-brand/40"
                      >
                        <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-surface-2 py-1.5">
                          <span className="text-[10px] font-bold uppercase text-brand">{fmtDay(w.date, { weekday: 'short' })}</span>
                          <span className="num font-display text-xl font-bold leading-none">{w.date.slice(8)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold">{w.name}</span>
                            {w.prCount > 0 && (
                              <Badge tone="pr">
                                <Trophy className="size-3" aria-hidden /> {w.prCount}
                              </Badge>
                            )}
                          </span>
                          <span className="block truncate text-sm text-muted">
                            {w.exercises.map((e) => e.name).join(' · ')}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {w.muscles.map((m) => (
                              <span key={m} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">
                                {MUSCLE_LABEL[m]}
                              </span>
                            ))}
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-right sm:block">
                          <span className="num block font-semibold">{fmtDuration(w.durationMin)}</span>
                          <span className="num block text-sm text-muted">
                            {w.setCount} sets · {fmtCompact(u.weight(w.volume, 0))} {u.w}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Cardio ----------

export const CARDIO_META: Record<CardioType, { label: string; icon: typeof Activity; color: string }> = {
  run: { label: 'Run', icon: Footprints, color: '#4ade80' },
  walk: { label: 'Walk', icon: Footprints, color: '#a3e635' },
  incline: { label: 'Incline walk', icon: Mountain, color: '#86efac' },
  cycle: { label: 'Cycle', icon: Bike, color: '#2dd4bf' },
  row: { label: 'Row', icon: Waves, color: '#38bdf8' },
  swim: { label: 'Swim', icon: Waves, color: '#818cf8' },
  elliptical: { label: 'Elliptical', icon: Activity, color: '#facc15' },
  stairs: { label: 'Stairs', icon: Activity, color: '#fb923c' },
  hiit: { label: 'HIIT', icon: Zap, color: '#f87171' },
  other: { label: 'Other', icon: HeartPulse, color: '#94a29a' },
};

function Cardio() {
  const u = useUnits();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CardioSession | null>(null);
  const { data: sessions } = useQuery({ queryKey: ['cardio'], queryFn: () => api.get<CardioSession[]>('/cardio') });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/cardio/${id}`), onSuccess: () => toast('Session deleted') });

  const today = localDay();
  const weeks = useMemo(() => {
    // Last 12 weeks, Monday-start, minutes stacked by type
    const monday = shiftDay(today, -((new Date().getDay() + 6) % 7));
    return Array.from({ length: 12 }, (_, i) => {
      const start = shiftDay(monday, (i - 11) * 7);
      const end = shiftDay(start, 6);
      const row: Record<string, number | string> = { week: start };
      for (const s of sessions ?? []) {
        if (s.date >= start && s.date <= end) row[s.type] = ((row[s.type] as number) ?? 0) + Math.round(s.durationMin);
      }
      return row;
    });
  }, [sessions, today]);

  const thirty = (sessions ?? []).filter((s) => s.date >= shiftDay(today, -29));
  const byType = Object.entries(
    thirty.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.type]: (acc[s.type] ?? 0) + s.durationMin }), {}),
  ).map(([type, minutes]) => ({ type: type as CardioType, minutes: Math.round(minutes) }));
  const usedTypes = [...new Set((sessions ?? []).map((s) => s.type))];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Sessions · 30d" value={thirty.length} />
        <MiniStat label="Time · 30d" value={fmtDuration(thirty.reduce((n, s) => n + s.durationMin, 0))} />
        <MiniStat label={`Distance · 30d`} value={u.dist(thirty.reduce((n, s) => n + (s.distanceKm ?? 0), 0))} unit={u.d} />
        <MiniStat label="Calories · 30d" value={fmtCompact(thirty.reduce((n, s) => n + (s.calories ?? 0), 0))} unit="kcal" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-wide">Weekly minutes</h2>
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
              Log cardio
            </Button>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="week" {...axisProps} tickFormatter={(w) => fmtDay(w, { month: 'numeric', day: 'numeric' })} interval={1} />
                <YAxis {...axisProps} width={44} />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-3)', radius: 6 }}
                  content={<ChartTooltip labelFormat={(w) => `Week of ${fmtDay(w)}`} format={(v) => `${v} min`} />}
                />
                {usedTypes.map((t, i) => (
                  <Bar
                    key={t}
                    dataKey={t}
                    name={CARDIO_META[t].label}
                    stackId="a"
                    fill={CARDIO_META[t].color}
                    radius={i === usedTypes.length - 1 ? [5, 5, 0, 0] : 0}
                    maxBarSize={28}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {usedTypes.map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: CARDIO_META[t].color }} />
                {CARDIO_META[t].label}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-display text-xl font-semibold tracking-wide">Mix · 30 days</h2>
          {byType.length ? (
            <div className="relative h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byType} dataKey="minutes" nameKey="type" innerRadius="62%" outerRadius="92%" paddingAngle={3} stroke="none">
                    {byType.map((b) => (
                      <Cell key={b.type} fill={CARDIO_META[b.type].color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip format={(v) => `${v} min`} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="num font-display text-3xl font-bold">{byType.reduce((n, b) => n + b.minutes, 0)}</span>
                <span className="text-xs text-muted">minutes</span>
              </div>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-muted">No cardio in the last 30 days.</p>
          )}
          <ul className="grid grid-cols-2 gap-1 text-xs">
            {byType.map((b) => (
              <li key={b.type} className="flex items-center gap-1.5 text-muted">
                <span className="size-2 rounded-full" style={{ background: CARDIO_META[b.type].color }} />
                {CARDIO_META[b.type].label} <span className="num ml-auto text-fg">{b.minutes}m</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">Sessions</h2>
        {!sessions ? (
          <Skeleton className="h-40" />
        ) : !sessions.length ? (
          <EmptyState
            icon={<HeartPulse className="size-5" />}
            title="No cardio yet"
            body="Runs, rides, rows and HIIT all count toward your weekly minutes."
            action={<Button onClick={() => setOpen(true)}>Log cardio</Button>}
          />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {sessions.slice(0, 40).map((s) => {
              const meta = CARDIO_META[s.type];
              const Icon = meta.icon;
              return (
                <li key={s.id} className="card group flex items-center gap-3 p-3.5">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `color-mix(in srgb, ${meta.color} 15%, transparent)`, color: meta.color }}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <button type="button" onClick={() => setEditing(s)} aria-label={`Edit ${meta.label} on ${s.date}`} className="min-w-0 flex-1 cursor-pointer text-left">
                    <span className="block font-semibold">
                      {meta.label}
                      <span className="font-normal text-muted"> · {relativeDay(s.date)}</span>
                    </span>
                    <span className="num flex flex-wrap gap-x-3 text-sm text-muted">
                      <span>{fmtDuration(s.durationMin)}</span>
                      {s.inclinePct ? (
                        <span className="flex items-center gap-1">
                          <Mountain className="size-3.5 text-brand" aria-hidden />
                          {s.inclinePct}%{s.speedKmh ? ` @ ${u.dist(s.speedKmh)} ${u.d === 'mi' ? 'mph' : 'km/h'}` : ''}
                        </span>
                      ) : null}
                      {s.distanceKm ? (
                        <span>
                          {u.dist(s.distanceKm, 2)} {u.d}
                        </span>
                      ) : null}
                      {s.distanceKm ? (
                        <span>
                          {u.pace(s.durationMin, s.distanceKm)} /{u.d}
                        </span>
                      ) : null}
                      {s.avgHeartRate ? (
                        <span className="flex items-center gap-1">
                          <HeartPulse className="size-3.5 text-danger" aria-hidden />
                          {s.avgHeartRate}
                        </span>
                      ) : null}
                      {s.calories ? (
                        <span className="flex items-center gap-1">
                          <Flame className="size-3.5 text-warn" aria-hidden />
                          {s.calories}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <IconButton label="Delete session" onClick={() => del.mutate(s.id)} className="opacity-60 group-hover:opacity-100">
                    <Trash className="size-4" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CardioSheet open={open} onClose={() => setOpen(false)} />
      <CardioSheet open={editing !== null} initial={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="card p-4">
      <p className="label">{label}</p>
      <p className="num mt-1 font-display text-3xl font-semibold">
        {value}
        {unit && <span className="text-sm font-medium text-muted"> {unit}</span>}
      </p>
    </div>
  );
}

const TREADMILL_TYPES: CardioType[] = ['incline', 'walk', 'run'];

function CardioSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: CardioSession | null }) {
  const u = useUnits();
  const toast = useToast();
  const { data: me } = useMe();
  const blank = { type: 'run' as CardioType, date: localDay(), duration: '', distance: '', calories: '', hr: '', incline: '', speed: '' };
  const fromSession = (c: CardioSession) => ({
    type: c.type,
    date: c.date,
    duration: String(c.durationMin),
    distance: c.distanceKm ? String(u.dist(c.distanceKm, 2)) : '',
    calories: c.calories ? String(c.calories) : '',
    hr: c.avgHeartRate ? String(c.avgHeartRate) : '',
    incline: c.inclinePct != null ? String(c.inclinePct) : '',
    speed: c.speedKmh ? String(u.dist(c.speedKmh)) : '',
  });
  const [f, setF] = useState(blank);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // Prefill when a different session is opened for editing.
  if (open && initial && initial.id !== loadedId) {
    setLoadedId(initial.id);
    setF(fromSession(initial));
  }
  const close = () => {
    if (initial) {
      setLoadedId(null);
      setF(blank);
    }
    onClose();
  };
  const set = (patch: Partial<typeof blank>) => setF((x) => ({ ...x, ...patch }));

  const treadmill = TREADMILL_TYPES.includes(f.type);
  const duration = Number(f.duration) || 0;
  const speedKmh = treadmill && f.speed ? u.toKm(Number(f.speed)) : null;
  // Distance typed wins; otherwise derive it from treadmill speed × time.
  const distanceKm = f.distance ? u.toKm(Number(f.distance)) : speedKmh && duration ? (speedKmh * duration) / 60 : null;
  const effectiveSpeed = speedKmh ?? (treadmill && distanceKm && duration ? distanceKm / (duration / 60) : null);
  const inclinePct = treadmill && f.incline ? Number(f.incline) : null;

  const estimate = estimateCardio({
    type: f.type,
    durationMin: duration,
    speedKmh: effectiveSpeed,
    inclinePct,
    avgHeartRate: f.hr ? Number(f.hr) : null,
    ...profileFor(me),
  });

  const save = useMutation({
    mutationFn: () =>
      (initial ? (body: unknown) => api.patch(`/cardio/${initial.id}`, body) : (body: unknown) => api.post('/cardio', body))({
        type: f.type,
        date: f.date,
        durationMin: duration,
        distanceKm: distanceKm ? Math.round(distanceKm * 100) / 100 : null,
        calories: f.calories ? Math.round(Number(f.calories)) : estimate.kcal || null,
        avgHeartRate: f.hr ? Math.round(Number(f.hr)) : null,
        inclinePct,
        speedKmh: speedKmh ? Math.round(speedKmh * 10) / 10 : null,
      }),
    onSuccess: () => {
      toast(initial ? 'Session updated' : 'Cardio logged');
      setF(blank);
      setLoadedId(null);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const valid = duration > 0;
  const num = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '');
  const speedUnit = u.d === 'mi' ? 'mph' : 'km/h';

  return (
    <Sheet
      open={open}
      onClose={close}
      title={initial ? 'Edit cardio' : 'Log cardio'}
      footer={
        <Button className="w-full" size="lg" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
          {initial ? 'Save changes' : 'Save session'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Cardio type">
          {(Object.keys(CARDIO_META) as CardioType[]).map((t) => {
            const meta = CARDIO_META[t];
            const Icon = meta.icon;
            const on = f.type === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ type: t })}
                className={clsx(
                  'flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-1 text-xs font-semibold transition-colors',
                  on ? 'border-transparent text-on-brand' : 'border-line-strong text-muted hover:text-fg',
                )}
                style={on ? { background: meta.color } : undefined}
              >
                <Icon className="size-5" aria-hidden />
                <span className="leading-tight">{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Duration (min)">
            {(id) => <Input id={id} inputMode="decimal" value={f.duration} onChange={(e) => set({ duration: num(e.target.value) })} placeholder="30" />}
          </Field>
          <Field label={`Distance (${u.d})`} hint={treadmill && speedKmh && !f.distance && distanceKm ? `≈ ${u.dist(distanceKm, 2)} ${u.d} from speed` : 'Optional'}>
            {(id) => <Input id={id} inputMode="decimal" value={f.distance} onChange={(e) => set({ distance: num(e.target.value) })} placeholder={distanceKm && !f.distance ? String(u.dist(distanceKm, 2)) : '5.0'} />}
          </Field>
        </div>

        {treadmill && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-line bg-surface-2/60 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              <Mountain className="size-3.5 text-brand" aria-hidden /> Treadmill
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Incline (%)">
                {(id) => <Input id={id} inputMode="decimal" value={f.incline} onChange={(e) => set({ incline: num(e.target.value) })} placeholder={f.type === 'incline' ? '12' : '0'} />}
              </Field>
              <Field label={`Speed (${speedUnit})`}>
                {(id) => <Input id={id} inputMode="decimal" value={f.speed} onChange={(e) => set({ speed: num(e.target.value) })} placeholder={f.type === 'run' ? (u.d === 'mi' ? '6.0' : '10') : u.d === 'mi' ? '3.0' : '5.0'} />}
              </Field>
            </div>
            {f.type === 'incline' && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Presets">
                {[
                  { label: '12-3-30', incline: '12', speed: u.d === 'mi' ? '3' : '4.8', duration: '30' },
                  { label: 'Hill walk', incline: '8', speed: u.d === 'mi' ? '3.5' : '5.6', duration: '40' },
                  { label: 'Steep', incline: '15', speed: u.d === 'mi' ? '2.5' : '4', duration: '25' },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => set({ incline: p.incline, speed: p.speed, duration: p.duration })}
                    className="min-h-9 cursor-pointer rounded-full border border-line-strong px-3 text-xs font-semibold text-muted hover:border-brand/50 hover:text-fg"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Avg heart rate" hint="Optional · improves the estimate">
            {(id) => <Input id={id} inputMode="numeric" value={f.hr} onChange={(e) => set({ hr: num(e.target.value) })} placeholder="145" />}
          </Field>
          <Field label="Calories" hint="Leave blank to use the estimate">
            {(id) => <Input id={id} inputMode="numeric" value={f.calories} onChange={(e) => set({ calories: num(e.target.value) })} placeholder={estimate.kcal ? String(estimate.kcal) : '320'} />}
          </Field>
        </div>

        {duration > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/8 p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Flame className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="num font-display text-2xl font-semibold leading-none">
                ≈ {estimate.kcal} <span className="text-sm text-muted">kcal burned</span>
              </p>
              <p className="text-xs text-muted">Estimated {BURN_METHOD_LABEL[estimate.method]}</p>
            </div>
            {effectiveSpeed && distanceKm ? (
              <div className="num text-right text-xs text-muted">
                Pace
                <span className="block font-semibold text-fg">
                  {u.pace(duration, distanceKm)} /{u.d}
                </span>
              </div>
            ) : null}
          </div>
        )}

        <Field label="Date">
          {(id) => <Input id={id} type="date" max={localDay()} value={f.date} onChange={(e) => set({ date: e.target.value })} />}
        </Field>
      </div>
    </Sheet>
  );
}

// ---------- Exercises ----------

function Exercises() {
  const { data } = useExercises();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('all');
  const list = (data ?? []).filter(
    (e) => (muscle === 'all' || e.muscleGroup === muscle) && e.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" className="pl-9" />
        </div>
        <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label="Muscle group" className="sm:w-48">
          <option value="all">All muscles</option>
          {Object.entries(MUSCLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => (
          <li key={e.id}>
            <Link to={`/train/exercises/${e.id}`} className="card flex items-center gap-3 p-3.5 transition-colors hover:border-brand/40">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 font-display text-sm font-bold uppercase text-muted">
                {e.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.name}</span>
                <span className="block text-xs capitalize text-muted">
                  {MUSCLE_LABEL[e.muscleGroup]} · {e.equipment}
                </span>
              </span>
              {e.timesPerformed > 0 ? <Badge>{e.timesPerformed}×</Badge> : e.isCustom ? <Badge tone="muted">Custom</Badge> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
