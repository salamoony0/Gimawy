import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { clsx } from 'clsx';
import { Area, AreaChart, Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Camera, ChevronRight, Dumbbell, Flame, Play, Scale, Target, Trophy, Utensils, Zap } from 'lucide-react';
import { api, type Dashboard, type Goal } from '../lib/api';
import { fmtCompact, fmtDay, fmtDuration, fmtInt, greeting, localDay, MUSCLE_LABEL, relativeDay, useUnits } from '../lib/format';
import { useActiveWorkout } from '../lib/activeWorkout';
import { Badge, Bar as ProgressBar, buttonClass, SectionTitle, Skeleton } from '../components/ui';
import { axisProps, ChartTooltip, GradientDefs, Heatmap, MacroLegend, Rings } from '../components/viz';

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } }),
};

export default function Today() {
  const today = localDay();
  const { data: d } = useQuery({ queryKey: ['dashboard', today], queryFn: () => api.get<Dashboard>(`/stats/dashboard?today=${today}`) });
  const { data: goals } = useQuery({ queryKey: ['goals', today], queryFn: () => api.get<Goal[]>(`/goals?today=${today}`) });
  const active = useActiveWorkout();
  const u = useUnits();

  if (!d) return <DashboardSkeleton />;

  const kcalLeft = d.targets.calories - d.nutrition.calories;
  const isNew = d.totals.workouts + d.totals.cardio === 0 && d.weight.count === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting */}
      <motion.div variants={rise} initial="hidden" animate="show" custom={0} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{fmtDay(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">
            {greeting()}, <span className="text-brand">{d.user.name.split(' ')[0]}</span>
          </h1>
        </div>
        <Link to="/train/log" className={buttonClass('primary', 'lg', 'w-full sm:w-auto')}>
          <Play className="size-4 fill-current" aria-hidden />
          {active ? 'Resume workout' : 'Start workout'}
        </Link>
      </motion.div>

      {isNew && <GettingStarted />}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Nutrition */}
        <motion.section variants={rise} initial="hidden" animate="show" custom={1} className="card glow p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-wide">Nutrition</h2>
            <Link to="/food" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
              Food log <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-2 flex flex-col items-center gap-6 sm:flex-row">
            <Rings
              size={176}
              stroke={13}
              label={`Calories ${d.nutrition.calories} of ${d.targets.calories}`}
              rings={[{ value: d.nutrition.calories / d.targets.calories, color: 'var(--color-brand)', label: 'Calories' }]}
            >
              <span className="num font-display text-4xl font-bold leading-none">{fmtInt(Math.abs(kcalLeft))}</span>
              <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted">
                {kcalLeft >= 0 ? 'kcal left' : 'kcal over'}
              </span>
              <span className="num mt-1 text-[11px] text-subtle">
                {fmtInt(d.nutrition.calories)} / {fmtInt(d.targets.calories)}
              </span>
              {d.burnedToday > 0 && (
                <span className="num mt-1 flex items-center gap-1 text-[11px] font-semibold text-warn">
                  <Flame className="size-3" aria-hidden />
                  {fmtInt(d.burnedToday)} burned
                </span>
              )}
            </Rings>
            <div className="w-full flex-1">
              <MacroLegend
                items={[
                  { label: 'Protein', value: d.nutrition.protein, target: d.targets.protein, color: 'var(--color-protein)' },
                  { label: 'Carbs', value: d.nutrition.carbs, target: d.targets.carbs, color: 'var(--color-carbs)' },
                  { label: 'Fat', value: d.nutrition.fat, target: d.targets.fat, color: 'var(--color-fat)' },
                ]}
              />
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link to="/food?scan=1" className={buttonClass('primary')}>
                  <Camera className="size-4" aria-hidden />
                  Scan meal
                </Link>
                <Link to="/food" className={buttonClass('secondary')}>
                  <Utensils className="size-4" aria-hidden />
                  Add food
                </Link>
              </div>
            </div>
          </div>
        </motion.section>

        {/* This week */}
        <motion.section variants={rise} initial="hidden" animate="show" custom={2} className="card flex flex-col p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-wide">This week</h2>
            <span className="flex items-center gap-1.5 rounded-full bg-pr/12 px-2.5 py-1 text-xs font-bold text-pr">
              <Flame className="size-3.5" aria-hidden />
              {d.streak} week streak
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Workouts</span>
              <span className="num font-display text-2xl font-semibold">
                {d.week.workouts}
                <span className="text-base text-muted"> / {d.targets.weeklyWorkouts}</span>
              </span>
            </div>
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {Array.from({ length: Math.max(d.targets.weeklyWorkouts, d.week.workouts) }, (_, i) => (
                <motion.span
                  key={i}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                  className={clsx('h-2.5 flex-1 origin-left rounded-full', i < d.week.workouts ? 'bg-brand' : 'bg-surface-3')}
                />
              ))}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-2 p-3">
              <p className="label">Volume</p>
              <p className="num mt-1 font-display text-2xl font-semibold">
                {fmtCompact(u.weight(d.week.volume, 0))}
                <span className="text-sm text-muted"> {u.w}</span>
              </p>
              {d.week.lastWeekVolume > 0 && (
                <p className={clsx('num text-xs font-semibold', d.week.volume >= d.week.lastWeekVolume ? 'text-brand' : 'text-muted')}>
                  {Math.round((d.week.volume / d.week.lastWeekVolume) * 100)}% of last week
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-surface-2 p-3">
              <p className="label">Cardio</p>
              <p className="num mt-1 font-display text-2xl font-semibold">
                {d.week.cardioMinutes}
                <span className="text-sm text-muted"> min</span>
              </p>
              <p className="num flex items-center gap-1 text-xs text-muted">
                <Flame className="size-3 text-warn" aria-hidden />
                {fmtInt(d.week.caloriesBurned)} kcal burned
              </p>
            </div>
          </div>
          <p className="label mt-auto pt-5">Volume · 8 weeks</p>
          <div className="mt-2 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.weeklyVolume} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="week" {...axisProps} tickFormatter={(w) => fmtDay(w, { month: 'numeric', day: 'numeric' })} interval={1} />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-3)', radius: 6 }}
                  content={
                    <ChartTooltip
                      labelFormat={(w) => `Week of ${fmtDay(w)}`}
                      format={(v) => `${fmtInt(u.weight(v, 0))} ${u.w}`}
                    />
                  }
                />
                <Bar dataKey="volume" name="Volume" radius={[6, 6, 2, 2]} maxBarSize={28}>
                  {d.weeklyVolume.map((w, i) => (
                    <Cell key={w.week} fill={i === d.weeklyVolume.length - 1 ? 'var(--color-brand)' : 'var(--color-brand-deep)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>
      </div>

      {/* Consistency heatmap */}
      <motion.section variants={rise} initial="hidden" animate="show" custom={3} className="card p-5">
        <SectionTitle
          title="Consistency"
          action={<span className="text-sm text-muted">Last 18 weeks</span>}
        />
        <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
          <Heatmap days={d.heatmap} />
          <ConsistencyStats days={d.heatmap} streak={d.streak} />
        </div>
      </motion.section>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Body weight */}
        <motion.section variants={rise} initial="hidden" animate="show" custom={4} className="card p-5">
          <SectionTitle
            title="Body weight"
            action={
              <Link to="/body" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
                Log <ChevronRight className="size-4" aria-hidden />
              </Link>
            }
          />
          {d.weight.latest ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="num font-display text-4xl font-semibold">
                  {u.weight(d.weight.entries.at(-1)?.trendKg ?? d.weight.latest.weightKg)}
                  <span className="text-lg text-muted"> {u.w}</span>
                </span>
                {d.weight.change30 != null && (
                  <Badge tone={d.weight.change30 <= 0 ? 'brand' : 'muted'}>
                    {d.weight.change30 > 0 ? '+' : ''}
                    {u.weight(d.weight.change30)} {u.w} · 30d
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted">7-day trend · last weigh-in {relativeDay(d.weight.latest.date).toLowerCase()}</p>
              <div className="mt-3 h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.weight.entries.map((e) => ({ ...e, w: u.weight(e.weightKg), t: u.weight(e.trendKg) }))}>
                    <GradientDefs id="wgrad" color="var(--color-brand)" />
                    <XAxis dataKey="date" hide />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                    <Tooltip
                      content={<ChartTooltip labelFormat={(l) => fmtDay(l)} format={(v) => `${v} ${u.w}`} />}
                      cursor={{ stroke: 'var(--color-line-strong)' }}
                    />
                    <Area type="monotone" dataKey="w" name="Scale" stroke="transparent" fill="transparent" dot={{ r: 1.6, fill: 'var(--color-muted)', strokeWidth: 0 }} activeDot={false} />
                    <Area type="monotone" dataKey="t" name="Trend" stroke="var(--color-brand)" strokeWidth={2.5} fill="url(#wgrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <Placeholder icon={<Scale className="size-5" />} text="Log your first weigh-in to see your trend line." to="/body" cta="Log weight" />
          )}
        </motion.section>

        {/* Calories 7 days */}
        <motion.section variants={rise} initial="hidden" animate="show" custom={5} className="card p-5">
          <SectionTitle title="Calories · 7 days" action={<span className="num text-sm text-muted">Target {fmtInt(d.targets.calories)}</span>} />
          <div className="h-[13.5rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.calories7} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" {...axisProps} tickFormatter={(l) => fmtDay(l, { weekday: 'narrow' })} />
                <YAxis {...axisProps} tickFormatter={fmtCompact} width={44} />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-3)', radius: 6 }}
                  content={<ChartTooltip labelFormat={(l) => fmtDay(l, { weekday: 'long', month: 'short', day: 'numeric' })} format={(v) => fmtInt(v)} />}
                />
                <ReferenceLine y={d.targets.calories} stroke="var(--color-brand)" strokeDasharray="4 4" strokeOpacity={0.6} />
                <Bar dataKey="calories" name="Calories" radius={[6, 6, 2, 2]} maxBarSize={30}>
                  {d.calories7.map((c) => (
                    <Cell key={c.date} fill={calorieColor(c.calories, d.targets.calories)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand" />On target (±10%)</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#15803d]" />Under</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-carbs" />Over</span>
          </p>
        </motion.section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Recent workouts */}
        <motion.section variants={rise} initial="hidden" animate="show" custom={6} className="card p-5 lg:col-span-2">
          <SectionTitle
            title="Recent workouts"
            action={
              <Link to="/train" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
                All <ChevronRight className="size-4" aria-hidden />
              </Link>
            }
          />
          {d.recentWorkouts.length ? (
            <ul className="flex flex-col gap-2">
              {d.recentWorkouts.map((w) => (
                <li key={w.id}>
                  <Link
                    to={`/train/workouts/${w.id}`}
                    className="flex items-center gap-4 rounded-2xl border border-line bg-surface-2/50 p-3 transition-colors hover:border-brand/40"
                  >
                    <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand/10 text-brand">
                      <Dumbbell className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">{w.name}</span>
                        {w.prCount > 0 && (
                          <Badge tone="pr">
                            <Trophy className="size-3" aria-hidden />
                            {w.prCount} PR
                          </Badge>
                        )}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {relativeDay(w.date)} · {fmtDuration(w.durationMin)} · {w.muscles.map((m) => MUSCLE_LABEL[m]).join(', ')}
                      </span>
                    </span>
                    <span className="hidden text-right sm:block">
                      <span className="num block font-display text-xl font-semibold">{fmtCompact(u.weight(w.volume, 0))}</span>
                      <span className="text-xs text-muted">{u.w} volume</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Placeholder icon={<Dumbbell className="size-5" />} text="No workouts yet. Your history shows up here." to="/train/log" cta="Start a workout" />
          )}
        </motion.section>

        {/* PRs */}
        <motion.section variants={rise} initial="hidden" animate="show" custom={7} className="card p-5">
          <SectionTitle title="Latest PRs" />
          {d.recentPrs.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {d.recentPrs.map((p, i) => (
                <li key={`${p.workoutId}-${p.exerciseId}`}>
                  <Link to={`/train/exercises/${p.exerciseId}`} className="flex items-center gap-3 py-2.5">
                    <span
                      className={clsx(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl',
                        i === 0 ? 'bg-pr text-on-brand' : 'bg-pr/12 text-pr',
                      )}
                    >
                      <Trophy className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.exercise}</span>
                      <span className="num text-xs text-muted">
                        {u.weight(p.weightKg)} {u.w} × {p.reps} · {relativeDay(p.date)}
                      </span>
                    </span>
                    <span className="num text-right text-xs text-muted">
                      e1RM
                      <span className="block font-display text-base font-semibold text-fg">{u.weight(p.e1rm)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Placeholder icon={<Trophy className="size-5" />} text="Beat a previous best and it lands here." />
          )}
        </motion.section>
      </div>

      {/* Goals */}
      {goals && goals.length > 0 && (
        <motion.section variants={rise} initial="hidden" animate="show" custom={8} className="card p-5">
          <SectionTitle
            title="Goals"
            action={
              <Link to="/body" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">
                Manage <ChevronRight className="size-4" aria-hidden />
              </Link>
            }
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {goals.map((g) => (
              <li key={g.id} className="rounded-2xl bg-surface-2 p-4">
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-brand" aria-hidden />
                  <span className="truncate text-sm font-semibold">{g.title}</span>
                </div>
                <p className="num mt-2 font-display text-3xl font-semibold">{Math.round(g.progress * 100)}%</p>
                <ProgressBar value={g.progress} label={`${g.title} progress`} className="mt-2" />
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </div>
  );
}

function calorieColor(kcal: number, target: number) {
  if (kcal === 0) return 'var(--color-surface-3)';
  if (Math.abs(kcal - target) <= target * 0.1) return 'var(--color-brand)';
  return kcal < target ? '#15803d' : 'var(--color-carbs)';
}

function ConsistencyStats({ days, streak }: { days: Dashboard['heatmap']; streak: number }) {
  const past = days.filter((d) => !d.future);
  const active = past.filter((d) => d.level > 0).length;
  const weeks = past.length / 7;
  const sessions = past.reduce((n, d) => n + d.strength + d.cardio, 0);
  const minutes = past.reduce((n, d) => n + d.minutes, 0);
  const stats = [
    { label: 'Active days', value: active, sub: `${Math.round((active / past.length) * 100)}% of days` },
    { label: 'Sessions / week', value: (sessions / weeks).toFixed(1), sub: `${sessions} sessions total` },
    { label: 'Time trained', value: `${Math.round(minutes / 60)}h`, sub: `${fmtDuration(Math.round(minutes / weeks))} per week` },
    { label: 'Week streak', value: streak, sub: streak ? 'Keep it alive' : 'Start one this week' },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3">
      {stats.map((s) => (
        <li key={s.label} className="rounded-2xl bg-surface-2 p-4">
          <p className="label">{s.label}</p>
          <p className="num mt-1 font-display text-3xl font-semibold">{s.value}</p>
          <p className="text-xs text-muted">{s.sub}</p>
        </li>
      ))}
    </ul>
  );
}

function Placeholder({ icon, text, to, cta }: { icon: React.ReactNode; text: string; to?: string; cta?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand">{icon}</span>
      <p className="text-sm text-muted">{text}</p>
      {to && cta && (
        <Link to={to} className="text-sm font-semibold text-brand hover:underline">
          {cta}
        </Link>
      )}
    </div>
  );
}

function GettingStarted() {
  const steps = [
    { to: '/settings', icon: Target, title: 'Set your targets', body: 'Calories, macros and units' },
    { to: '/body', icon: Scale, title: 'Log your weight', body: 'Start your trend line' },
    { to: '/train/log', icon: Dumbbell, title: 'Log a workout', body: 'Pick from 69 exercises' },
    { to: '/food?scan=1', icon: Zap, title: 'Scan a meal', body: 'Let AI fill your macros' },
  ];
  return (
    <section className="card glow p-5">
      <h2 className="font-display text-xl font-semibold tracking-wide">Get set up</h2>
      <p className="text-sm text-muted">Four quick steps and your dashboard comes alive.</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ to, icon: Icon, title, body }, i) => (
          <li key={to}>
            <Link to={to} className="flex h-full items-center gap-3 rounded-2xl border border-line bg-bg/40 p-3 transition-colors hover:border-brand/50">
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand">
                <Icon className="size-5" aria-hidden />
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-on-brand">
                  {i + 1}
                </span>
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-muted">{body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <Skeleton className="h-16 w-2/3" />
      <div className="grid gap-5 lg:grid-cols-5">
        <Skeleton className="h-64 lg:col-span-3" />
        <Skeleton className="h-64 lg:col-span-2" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}
