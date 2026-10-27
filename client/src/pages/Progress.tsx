import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, Dumbbell, Flame, HeartPulse, Layers, MapPin, Trophy, Weight } from 'lucide-react';
import { api, type Progress as ProgressData } from '../lib/api';
import { fmtCompact, fmtDay, fmtInt, localDay, MUSCLE_LABEL, relativeDay, useUnits } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Badge, Segmented, Skeleton } from '../components/ui';
import { axisProps, ChartTooltip, GradientDefs, gridProps, Rings } from '../components/viz';
import { CARDIO_META } from './Train';

const LIFT_COLORS = ['#4ade80', '#2dd4bf', '#facc15', '#38bdf8'];

export default function Progress() {
  const [range, setRange] = useState<'30' | '90' | '365' | 'all'>('90');
  const u = useUnits();
  const today = localDay();
  const { data: p } = useQuery({
    queryKey: ['progress', range, today],
    queryFn: () => api.get<ProgressData>(`/stats/progress?range=${range}&today=${today}`),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Progress"
        action={
          <Segmented
            label="Time range"
            value={range}
            onChange={setRange}
            options={[
              { value: '30', label: '30D' },
              { value: '90', label: '90D' },
              { value: '365', label: '1Y' },
              { value: 'all', label: 'All' },
            ]}
            className="w-full sm:w-72"
          />
        }
      />

      {!p ? (
        <div className="grid gap-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Totals */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { icon: Dumbbell, label: 'Workouts', value: p.totals.workouts },
              { icon: Weight, label: `Volume (${u.w})`, value: fmtCompact(u.weight(p.totals.volume, 0)) },
              { icon: Layers, label: 'Working sets', value: fmtInt(p.totals.sets) },
              { icon: Trophy, label: 'PRs', value: p.totals.prs },
              { icon: Clock, label: 'Hours lifting', value: p.totals.hours },
              { icon: HeartPulse, label: 'Cardio sessions', value: p.totals.cardioSessions },
              { icon: Flame, label: 'Cardio minutes', value: fmtInt(p.totals.cardioMinutes) },
              { icon: MapPin, label: `Distance (${u.d})`, value: u.dist(p.totals.distanceKm) },
              { icon: Flame, label: 'Calories burned', value: fmtCompact(p.totals.caloriesBurned) },
              { icon: Trophy, label: 'Avg burn / workout', value: p.totals.workouts + p.totals.cardioSessions ? fmtInt(p.totals.caloriesBurned / (p.totals.workouts + p.totals.cardioSessions)) : '—' },
            ].map(({ icon: Icon, label, value }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="card p-4"
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                  <Icon className="size-3.5 text-brand" aria-hidden />
                  {label}
                </p>
                <p className="num mt-1 font-display text-3xl font-semibold">{value}</p>
              </motion.div>
            ))}
          </div>

          {/* Strength curves */}
          <section>
            <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">Strength curves</h2>
            {p.topLifts.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {p.topLifts.map((l, i) => (
                  <Link key={l.exerciseId} to={`/train/exercises/${l.exerciseId}`} className="card block p-4 transition-colors hover:border-brand/40">
                    <p className="truncate font-semibold">{l.name}</p>
                    <div className="flex items-baseline justify-between">
                      <span className="num font-display text-3xl font-semibold">
                        {u.weight(l.best)}
                        <span className="text-sm text-muted"> {u.w}</span>
                      </span>
                      <Badge tone={l.change > 0 ? 'brand' : 'muted'}>
                        {l.change > 0 ? '+' : ''}
                        {u.weight(l.change)} {u.w}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted">Best e1RM · {l.sessions} sessions</p>
                    <div className="mt-2 h-20">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={l.points.map((pt) => ({ ...pt, v: u.weight(pt.e1rm) }))}>
                          <GradientDefs id={`lift${i}`} color={LIFT_COLORS[i]} />
                          <YAxis domain={['dataMin - 2', 'dataMax + 2']} hide />
                          <XAxis dataKey="date" hide />
                          <Tooltip content={<ChartTooltip labelFormat={(d) => fmtDay(d)} format={(v) => `${v} ${u.w}`} />} />
                          <Area type="monotone" dataKey="v" name="e1RM" stroke={LIFT_COLORS[i]} strokeWidth={2} fill={`url(#lift${i})`} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Log a few workouts to see strength curves.</p>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Weekly volume */}
            <section className="card p-5 lg:col-span-2">
              <h2 className="font-display text-xl font-semibold tracking-wide">Weekly training load</h2>
              <p className="text-sm text-muted">Bars: volume · Line: workouts</p>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={p.weekly.map((w) => ({ ...w, vol: u.weight(w.volume, 0) }))} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="week" {...axisProps} tickFormatter={(w) => fmtDay(w)} minTickGap={24} />
                    <YAxis yAxisId="v" {...axisProps} tickFormatter={fmtCompact} width={48} />
                    <YAxis yAxisId="w" orientation="right" {...axisProps} allowDecimals={false} width={24} />
                    <Tooltip
                      cursor={{ fill: 'var(--color-surface-3)' }}
                      content={<ChartTooltip labelFormat={(w) => `Week of ${fmtDay(w)}`} format={(v, k) => (k === 'vol' ? `${fmtInt(v)} ${u.w}` : String(v))} />}
                    />
                    <Bar yAxisId="v" dataKey="vol" name="Volume" fill="var(--color-brand-deep)" stroke="var(--color-brand)" strokeOpacity={0.4} radius={[5, 5, 1, 1]} maxBarSize={26} />
                    <Line yAxisId="w" type="monotone" dataKey="workouts" name="Workouts" stroke="var(--color-brand)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--color-brand)' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Muscle balance */}
            <section className="card p-5">
              <h2 className="font-display text-xl font-semibold tracking-wide">Muscle balance</h2>
              <p className="text-sm text-muted">Working sets per muscle group</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={p.muscleSplit.map((m) => ({ ...m, label: MUSCLE_LABEL[m.muscle] }))} outerRadius="72%">
                    <PolarGrid stroke="var(--color-line-strong)" />
                    <PolarAngleAxis dataKey="label" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip format={(v) => `${v} sets`} />} />
                    <Radar dataKey="sets" name="Sets" stroke="var(--color-brand)" strokeWidth={2} fill="var(--color-brand)" fillOpacity={0.25} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Cardio */}
            <section className="card p-5 lg:col-span-2">
              <h2 className="font-display text-xl font-semibold tracking-wide">Cardio</h2>
              <div className="mt-3 grid gap-5 md:grid-cols-[1fr_14rem]">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={p.weekly} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                      <GradientDefs id="cardiograd" color="var(--color-cardio)" />
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="week" {...axisProps} tickFormatter={(w) => fmtDay(w)} minTickGap={24} />
                      <YAxis {...axisProps} width={44} />
                      <Tooltip content={<ChartTooltip labelFormat={(w) => `Week of ${fmtDay(w)}`} format={(v) => `${v} min`} />} />
                      <Area type="monotone" dataKey="cardioMinutes" name="Minutes" stroke="var(--color-cardio)" strokeWidth={2.5} fill="url(#cardiograd)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {p.cardioByType.map((c) => {
                    const max = p.cardioByType[0].minutes || 1;
                    const meta = CARDIO_META[c.type];
                    return (
                      <li key={c.type}>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{meta.label}</span>
                          <span className="num text-muted">
                            {c.minutes}m{c.distanceKm ? ` · ${u.dist(c.distanceKm)} ${u.d}` : ''}
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-surface-3">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: meta.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${(c.minutes / max) * 100}%` }}
                            transition={{ duration: 0.8 }}
                          />
                        </div>
                      </li>
                    );
                  })}
                  {!p.cardioByType.length && <li className="text-sm text-muted">No cardio in this range.</li>}
                </ul>
              </div>
            </section>

            {/* Weekday rhythm */}
            <section className="card p-5">
              <h2 className="font-display text-xl font-semibold tracking-wide">Weekly rhythm</h2>
              <p className="text-sm text-muted">Sessions by day of week</p>
              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={p.weekdays} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="day" {...axisProps} />
                    <YAxis {...axisProps} allowDecimals={false} width={44} />
                    <Tooltip cursor={{ fill: 'var(--color-surface-3)' }} content={<ChartTooltip />} />
                    <Bar dataKey="strength" name="Strength" stackId="a" fill="var(--color-brand)" maxBarSize={26} />
                    <Bar dataKey="cardio" name="Cardio" stackId="a" fill="var(--color-cardio)" radius={[5, 5, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand" />Strength</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-cardio" />Cardio</span>
              </p>
            </section>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-3">
            {/* Nutrition adherence */}
            <section className="card p-5">
              <h2 className="font-display text-xl font-semibold tracking-wide">Nutrition</h2>
              <p className="text-sm text-muted">{p.nutrition.daysLogged} days logged</p>
              <div className="mt-4 flex items-center gap-5">
                <Rings
                  size={120}
                  stroke={11}
                  label={`Calorie target hit ${Math.round(p.nutrition.calorieAdherence * 100)}% of days, protein ${Math.round(p.nutrition.proteinAdherence * 100)}%`}
                  rings={[
                    { value: p.nutrition.calorieAdherence, color: 'var(--color-brand)', label: 'Calories' },
                    { value: p.nutrition.proteinAdherence, color: 'var(--color-fat)', label: 'Protein' },
                  ]}
                />
                <ul className="flex flex-col gap-3 text-sm">
                  <li>
                    <span className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-full bg-brand" />Calories on target</span>
                    <span className="num font-display text-2xl font-semibold">{Math.round(p.nutrition.calorieAdherence * 100)}%</span>
                  </li>
                  <li>
                    <span className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-full bg-fat" />Protein goal hit</span>
                    <span className="num font-display text-2xl font-semibold">{Math.round(p.nutrition.proteinAdherence * 100)}%</span>
                  </li>
                </ul>
              </div>
              <div className="num mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-xs text-muted">Avg calories</p>
                  <p className="font-display text-xl font-semibold">
                    {fmtInt(p.nutrition.avgCalories)}
                    <span className="text-xs text-muted"> / {fmtInt(p.nutrition.targetCalories)}</span>
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-xs text-muted">Avg protein</p>
                  <p className="font-display text-xl font-semibold">
                    {p.nutrition.avgProtein}g<span className="text-xs text-muted"> / {p.nutrition.targetProtein}g</span>
                  </p>
                </div>
              </div>
            </section>

            {/* Weight */}
            <section className="card p-5">
              <h2 className="font-display text-xl font-semibold tracking-wide">Body weight</h2>
              {p.weight.change != null && (
                <p className="num text-sm text-muted">
                  <span className="font-semibold text-brand">
                    {p.weight.change > 0 ? '+' : ''}
                    {u.weight(p.weight.change)} {u.w}
                  </span>{' '}
                  in this range
                </p>
              )}
              <div className="mt-3 h-48">
                {p.weight.entries.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={p.weight.entries.map((e) => ({ ...e, t: u.weight(e.trendKg) }))} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDay(d)} minTickGap={30} />
                      <YAxis {...axisProps} domain={['dataMin - 0.5', 'dataMax + 0.5']} width={44} tickFormatter={(v) => String(Math.round(v))} />
                      <Tooltip content={<ChartTooltip labelFormat={(d) => fmtDay(d)} format={(v) => `${v} ${u.w}`} />} />
                      <Line type="monotone" dataKey="t" name="Trend" stroke="var(--color-brand)" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-12 text-center text-sm text-muted">Not enough weigh-ins in this range.</p>
                )}
              </div>
            </section>

            {/* PR feed */}
            <section className="card p-5">
              <h2 className="font-display text-xl font-semibold tracking-wide">PR timeline</h2>
              <ol className="relative mt-3 border-l border-line-strong pl-5">
                {p.prs.slice(0, 6).map((pr) => (
                  <li key={`${pr.workoutId}-${pr.exerciseId}`} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-[27px] top-1 flex size-3.5 items-center justify-center rounded-full bg-pr ring-4 ring-surface" aria-hidden />
                    <p className="text-xs text-muted">{relativeDay(pr.date)}</p>
                    <Link to={`/train/exercises/${pr.exerciseId}`} className="font-semibold hover:text-brand">
                      {pr.exercise}
                    </Link>
                    <p className="num text-sm text-muted">
                      {u.weight(pr.weightKg)} {u.w} × {pr.reps} · e1RM {u.weight(pr.e1rm)}
                    </p>
                  </li>
                ))}
                {!p.prs.length && <li className="text-sm text-muted">No PRs in this range yet.</li>}
              </ol>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
