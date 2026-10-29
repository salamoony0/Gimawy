import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { clsx } from 'clsx';
import { CartesianGrid, ComposedChart, Area, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, Dumbbell, HeartPulse, Minus, Pencil, Plus, Scale, Target, Trash } from 'lucide-react';
import { api, isQueued, type BodyWeight, type Goal } from '../lib/api';
import { fmtDay, localDay, parseDay, relativeDay, shiftDay, useMe, useUnits } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Bar, Button, EmptyState, Field, IconButton, Input, Segmented, Select, Sheet, Skeleton, useToast } from '../components/ui';
import { axisProps, ChartTooltip, GradientDefs, gridProps } from '../components/viz';
import { useExercises } from '../components/ExercisePicker';

/** Trailing 7-day average over weigh-ins within the last 7 calendar days. */
function withTrend(entries: BodyWeight[]) {
  return entries.map((e, i) => {
    const t = parseDay(e.date).getTime();
    const win = entries.slice(0, i + 1).filter((x) => t - parseDay(x.date).getTime() < 7 * 86_400_000);
    return { ...e, trendKg: win.reduce((n, x) => n + x.weightKg, 0) / win.length };
  });
}

export default function Body() {
  const u = useUnits();
  const { data: me } = useMe();
  const toast = useToast();
  const [range, setRange] = useState<'30' | '90' | 'all'>('90');
  const [goalOpen, setGoalOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const today = localDay();
  const { data: entries } = useQuery({ queryKey: ['body'], queryFn: () => api.get<BodyWeight[]>('/body') });
  const { data: goals } = useQuery({ queryKey: ['goals', today], queryFn: () => api.get<Goal[]>(`/goals?today=${today}`) });
  const delEntry = useMutation({ mutationFn: (date: string) => api.del(`/body/${date}`), onSuccess: () => toast('Weigh-in removed') });
  const delGoal = useMutation({ mutationFn: (id: string) => api.del(`/goals/${id}`), onSuccess: () => toast('Goal removed') });

  const trend = useMemo(() => withTrend(entries ?? []), [entries]);
  const latest = trend.at(-1);
  const weightGoal = goals?.find((g) => g.type === 'weight');

  // Rate of change over the last 28 days, from the trend line (kg per week)
  const ref = [...trend].reverse().find((e) => e.date <= shiftDay(today, -28));
  const ratePerWeek = latest && ref ? ((latest.trendKg - ref.trendKg) / ((parseDay(latest.date).getTime() - parseDay(ref.date).getTime()) / 86_400_000)) * 7 : null;
  const weekAgo = [...trend].reverse().find((e) => e.date <= shiftDay(today, -7));
  const change7 = latest && weekAgo ? latest.trendKg - weekAgo.trendKg : null;
  const bmi = latest && me?.heightCm ? latest.trendKg / (me.heightCm / 100) ** 2 : null;

  let eta: string | null = null;
  if (weightGoal && latest && ratePerWeek && Math.abs(ratePerWeek) > 0.02) {
    const remaining = weightGoal.targetValue - latest.trendKg;
    const weeks = remaining / ratePerWeek;
    if (weeks > 0 && weeks < 200) eta = shiftDay(today, Math.round(weeks * 7));
  }

  const from = range === 'all' ? '0000' : shiftDay(today, -Number(range) + 1);
  const chart = trend
    .filter((e) => e.date >= from)
    .map((e) => ({ date: e.date, scale: u.weight(e.weightKg), trend: u.weight(e.trendKg) }));

  return (
    <>
      <PageHeader eyebrow="Body" title="Weight & goals" />

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <WeighIn latestKg={latest?.weightKg} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <Tile label="Trend weight" value={latest ? u.weight(latest.trendKg) : '—'} unit={u.w} sub={latest ? `Scale ${u.weight(latest.weightKg)} · ${relativeDay(latest.date)}` : 'No data'} />
          <Tile
            label="7-day change"
            value={change7 != null ? `${change7 > 0 ? '+' : ''}${u.weight(change7)}` : '—'}
            unit={u.w}
            tone={change7 == null ? undefined : change7 <= 0 ? 'good' : 'neutral'}
          />
          <Tile
            label="Rate"
            value={ratePerWeek != null ? `${ratePerWeek > 0 ? '+' : ''}${u.weight(ratePerWeek, 2)}` : '—'}
            unit={`${u.w}/wk`}
            sub="Last 4 weeks"
          />
          <Tile label="BMI" value={bmi ? bmi.toFixed(1) : '—'} sub={me?.heightCm ? `${me.heightCm} cm` : 'Add height in settings'} />
        </div>
      </div>

      <section className="card mt-5 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-wide">Trend</h2>
            {eta && weightGoal && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <CalendarClock className="size-4 text-brand" aria-hidden />
                At this pace you’ll hit {u.weight(weightGoal.targetValue)} {u.w} around{' '}
                <span className="font-semibold text-fg">{fmtDay(eta, { month: 'long', day: 'numeric' })}</span>
              </p>
            )}
          </div>
          <Segmented
            label="Chart range"
            value={range}
            onChange={setRange}
            options={[
              { value: '30', label: '30D' },
              { value: '90', label: '90D' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {!entries ? (
          <Skeleton className="h-72" />
        ) : chart.length < 2 ? (
          <EmptyState icon={<Scale className="size-5" />} title="Not enough data yet" body="Log your weight on a few mornings to see your trend." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <GradientDefs id="bodygrad" color="var(--color-brand)" />
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDay(d)} minTickGap={28} />
                <YAxis
                  {...axisProps}
                  width={48}
                  domain={[
                    (min: number) => Math.floor(Math.min(min, weightGoal ? u.weight(weightGoal.targetValue) : min) - 1),
                    (max: number) => Math.ceil(max + 1),
                  ]}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--color-line-strong)' }}
                  content={<ChartTooltip labelFormat={(d) => fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' })} format={(v) => `${v} ${u.w}`} />}
                />
                {weightGoal && (
                  <ReferenceLine
                    y={u.weight(weightGoal.targetValue)}
                    stroke="var(--color-pr)"
                    strokeDasharray="6 4"
                    label={{ value: `Goal ${u.weight(weightGoal.targetValue)}`, fill: 'var(--color-pr)', fontSize: 11, position: 'insideBottomRight' }}
                  />
                )}
                <Area type="monotone" dataKey="trend" stroke="none" fill="url(#bodygrad)" tooltipType="none" />
                <Scatter dataKey="scale" name="Scale" fill="var(--color-muted)" shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={2.5} fill="var(--color-muted)" opacity={0.7} />} />
                <Line type="monotone" dataKey="trend" name="7-day trend" stroke="var(--color-brand)" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-brand" />7-day trend</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted" />Daily weigh-in</span>
          {weightGoal && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-pr" />Goal</span>}
        </p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-wide">Goals</h2>
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setGoalOpen(true)}>
              New goal
            </Button>
          </div>
          {!goals ? (
            <Skeleton className="h-40" />
          ) : !goals.length ? (
            <EmptyState icon={<Target className="size-5" />} title="No goals yet" body="Set a body weight, lift or cardio goal and track it automatically." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {goals.map((g, i) => (
                <GoalCard key={g.id} goal={g} index={i} onEdit={() => setEditGoal(g)} onDelete={() => delGoal.mutate(g.id)} />
              ))}
            </ul>
          )}
        </section>

        <section className="card p-0">
          <h2 className="px-4 pb-2 pt-4 font-display text-xl font-semibold tracking-wide">Recent weigh-ins</h2>
          <ul className="max-h-96 overflow-y-auto">
            {[...trend].reverse().slice(0, 30).map((e, i, arr) => {
              const prev = arr[i + 1];
              const diff = prev ? e.weightKg - prev.weightKg : 0;
              return (
                <li key={e.date} className="group flex items-center gap-3 border-t border-line/60 px-4 py-2">
                  <span className="flex-1 text-sm">{relativeDay(e.date)}</span>
                  {prev && (
                    <span className={clsx('num text-xs', diff <= 0 ? 'text-brand' : 'text-muted')}>
                      {diff > 0 ? '+' : ''}
                      {u.weight(diff)}
                    </span>
                  )}
                  <span className="num w-20 text-right font-semibold">
                    {u.weight(e.weightKg)} <span className="text-xs font-normal text-muted">{u.w}</span>
                  </span>
                  <IconButton label={`Delete weigh-in on ${e.date}`} className="size-9 opacity-50 group-hover:opacity-100" onClick={() => delEntry.mutate(e.date)}>
                    <Trash className="size-4" />
                  </IconButton>
                </li>
              );
            })}
            {!trend.length && <li className="px-4 pb-4 text-sm text-muted">No weigh-ins yet.</li>}
          </ul>
        </section>
      </div>

      <GoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} />
      <GoalSheet open={editGoal !== null} initial={editGoal} onClose={() => setEditGoal(null)} />
    </>
  );
}

function WeighIn({ latestKg }: { latestKg?: number }) {
  const u = useUnits();
  const toast = useToast();
  const [date, setDate] = useState(localDay());
  const [value, setValue] = useState('');
  const shown = value || (latestKg ? String(u.weight(latestKg)) : '');
  const save = useMutation({
    mutationFn: () => api.offline('PUT', `/body/${date}`, { weightKg: u.toKg(Number(shown)) }, `Weigh-in ${shown} ${u.w}`),
    onSuccess: (res) => {
      toast(isQueued(res) ? `${shown} ${u.w} saved on this device, it will sync automatically.` : `Logged ${shown} ${u.w}`);
      setValue('');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const bump = (d: number) => setValue(String(Math.round(((Number(shown) || 0) + d) * 10) / 10));

  return (
    <section className="card glow flex flex-col p-5">
      <h2 className="font-display text-xl font-semibold tracking-wide">Log weight</h2>
      <p className="text-sm text-muted">Same time each morning gives the cleanest trend.</p>
      <div className="mt-4 flex items-center gap-2">
        <IconButton label={`Decrease by 0.1 ${u.w}`} onClick={() => bump(-0.1)} className="size-12 border border-line-strong">
          <Minus className="size-5" />
        </IconButton>
        <label className="relative flex-1">
          <span className="sr-only">Weight in {u.w}</span>
          <input
            inputMode="decimal"
            value={shown}
            onChange={(e) => setValue(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
            placeholder="0.0"
            className="num h-16 w-full rounded-2xl border border-line-strong bg-bg/60 text-center font-display text-4xl font-bold outline-none focus:border-brand"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">{u.w}</span>
        </label>
        <IconButton label={`Increase by 0.1 ${u.w}`} onClick={() => bump(0.1)} className="size-12 border border-line-strong">
          <Plus className="size-5" />
        </IconButton>
      </div>
      <Field label="Date" className="mt-3">
        {(id) => <Input id={id} type="date" max={localDay()} value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Button className="mt-4" size="lg" disabled={!(Number(shown) > 0)} loading={save.isPending} onClick={() => save.mutate()}>
        Save weigh-in
      </Button>
    </section>
  );
}

function Tile({ label, value, unit, sub, tone }: { label: string; value: React.ReactNode; unit?: string; sub?: string; tone?: 'good' | 'neutral' }) {
  return (
    <div className="card flex flex-col justify-between p-4">
      <p className="label">{label}</p>
      <p className={clsx('num mt-2 font-display text-3xl font-semibold leading-none', tone === 'good' && 'text-brand')}>
        {value}
        {unit && <span className="text-sm font-medium text-muted"> {unit}</span>}
      </p>
      {sub && <p className="mt-1.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

const GOAL_ICON = { weight: Scale, lift: Dumbbell, cardio: HeartPulse };

function GoalCard({ goal: g, index, onEdit, onDelete }: { goal: Goal; index: number; onEdit: () => void; onDelete: () => void }) {
  const u = useUnits();
  const Icon = GOAL_ICON[g.type];
  const fmt = (v: number | null) => (v == null ? '—' : g.type === 'cardio' ? `${Math.round(v)} min` : `${u.weight(v)} ${u.w}`);
  const daysLeft = g.deadline ? Math.ceil((parseDay(g.deadline).getTime() - parseDay(localDay()).getTime()) / 86_400_000) : null;
  const done = g.progress >= 1;
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={clsx('card group p-4', done && 'border-brand/50')}
    >
      <div className="flex items-start gap-3">
        <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl', done ? 'bg-brand text-on-brand' : 'bg-brand/12 text-brand')}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{g.title}</p>
          <p className="text-xs text-muted">
            {g.type === 'lift' ? `${g.exerciseName} · est. 1RM` : g.type === 'cardio' ? 'This week' : 'Body weight'}
            {daysLeft != null && ` · ${daysLeft >= 0 ? `${daysLeft} days left` : 'past deadline'}`}
          </p>
        </div>
        <div className="-mr-2 -mt-2 flex opacity-60 group-hover:opacity-100">
          <IconButton label={`Edit goal ${g.title}`} onClick={onEdit} className="size-9">
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label={`Delete goal ${g.title}`} onClick={onDelete} className="size-9">
            <Trash className="size-4" />
          </IconButton>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="num font-display text-3xl font-semibold">{Math.round(g.progress * 100)}%</span>
        <span className="num text-sm text-muted">
          {fmt(g.current)} → <span className="font-semibold text-fg">{fmt(g.targetValue)}</span>
        </span>
      </div>
      <Bar value={g.progress} label={`${g.title} progress`} className="mt-2" color={done ? 'var(--color-pr)' : undefined} />
    </motion.li>
  );
}

function GoalSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Goal | null }) {
  const u = useUnits();
  const toast = useToast();
  const { data: exercises } = useExercises();
  const [type, setType] = useState<Goal['type']>('weight');
  const [target, setTarget] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // Prefill when opened to edit a different goal.
  if (open && initial && initial.id !== loadedId) {
    setLoadedId(initial.id);
    setType(initial.type);
    setTarget(String(initial.type === 'cardio' ? initial.targetValue : u.weight(initial.targetValue)));
    setExerciseId(initial.exerciseId ?? '');
    setDeadline(initial.deadline ?? '');
  }

  const exerciseName = exercises?.find((e) => e.id === exerciseId)?.name;
  const title =
    type === 'weight'
      ? `Reach ${target || '…'} ${u.w}`
      : type === 'lift'
        ? `${exerciseName ?? 'Lift'} ${target || '…'} ${u.w}`
        : `${target || '…'} min cardio / week`;

  const targetValue = type === 'cardio' ? Number(target) : u.toKg(Number(target));
  const save = useMutation({
    mutationFn: () =>
      initial
        ? api.patch(`/goals/${initial.id}`, { title, targetValue, deadline: deadline || null })
        : api.post('/goals', {
            type,
            title,
            exerciseId: type === 'lift' ? exerciseId : null,
            targetValue,
            deadline: deadline || null,
          }),
    onSuccess: () => {
      toast(initial ? 'Goal updated' : 'Goal created');
      setTarget('');
      setDeadline('');
      setLoadedId(null);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const sorted = [...(exercises ?? [])].sort((a, b) => b.timesPerformed - a.timesPerformed || a.name.localeCompare(b.name));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? 'Edit goal' : 'New goal'}
      footer={
        <Button className="w-full" size="lg" disabled={!(Number(target) > 0) || (type === 'lift' && !exerciseId)} loading={save.isPending} onClick={() => save.mutate()}>
          {initial ? 'Save goal' : 'Create goal'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {!initial && (
          <Segmented
            label="Goal type"
            value={type}
            onChange={setType}
            options={[
              { value: 'weight', label: 'Body weight' },
              { value: 'lift', label: 'Lift' },
              { value: 'cardio', label: 'Cardio' },
            ]}
          />
        )}
        {type === 'lift' && !initial && (
          <Field label="Exercise" hint="Progress uses your best estimated 1-rep max.">
            {(id) => (
              <Select id={id} value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
                <option value="">Choose an exercise</option>
                {sorted.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={type === 'cardio' ? 'Minutes per week' : `Target (${u.w})`}>
          {(id) => <Input id={id} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={type === 'cardio' ? '150' : type === 'lift' ? '100' : '75'} />}
        </Field>
        {type !== 'cardio' && (
          <Field label="Deadline" hint="Optional">
            {(id) => <Input id={id} type="date" min={localDay()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />}
          </Field>
        )}
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">
          Goal name: <span className="font-semibold text-fg">{title}</span>
        </p>
      </div>
    </Sheet>
  );
}
