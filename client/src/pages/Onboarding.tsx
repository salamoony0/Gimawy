import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { ArrowLeft, ArrowRight, Armchair, Bike, Dumbbell, Flame, Footprints, Minus, Scale, Target, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { api, type User } from '../lib/api';
import { fmtDay, fmtInt, localDay, shiftDay, useMe } from '../lib/format';
import { ACTIVITY, ageFrom, KCAL_PER_KG, planTargets, type ActivityLevel, type Goal, type Sex } from '../lib/energy';
import { Logo } from '../components/Layout';
import { Button, Field, Input, Segmented, useToast } from '../components/ui';

const KG_PER_LB = 0.45359237;

const ACTIVITY_ICON: Record<ActivityLevel, typeof Armchair> = {
  sedentary: Armchair,
  light: Footprints,
  moderate: Bike,
  active: Dumbbell,
  very_active: Trophy,
};

const GOALS: { value: Goal; label: string; body: string; icon: typeof Scale }[] = [
  { value: 'lose', label: 'Lose fat', body: 'Calorie deficit, high protein', icon: TrendingDown },
  { value: 'maintain', label: 'Maintain', body: 'Recomp and keep your weight', icon: Minus },
  { value: 'gain', label: 'Build muscle', body: 'Lean surplus for size and strength', icon: TrendingUp },
];

// kg per week
const RATES: Record<Exclude<Goal, 'maintain'>, { kg: number; label: string }[]> = {
  lose: [
    { kg: 0.25, label: 'Gentle' },
    { kg: 0.5, label: 'Steady' },
    { kg: 0.75, label: 'Fast' },
    { kg: 1, label: 'Aggressive' },
  ],
  gain: [
    { kg: 0.125, label: 'Lean' },
    { kg: 0.25, label: 'Steady' },
    { kg: 0.5, label: 'Fast' },
  ],
};

const STEPS = ['About you', 'Activity', 'Goal', 'Your plan'];

export default function Onboarding() {
  const { data: me } = useMe();
  if (!me) return null;
  return <Wizard me={me} />;
}

function Wizard({ me }: { me: User }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  const lb = me.weightUnit === 'lb';
  const [units, setUnits] = useState<'metric' | 'imperial'>(lb ? 'imperial' : 'metric');
  const [sex, setSex] = useState<Sex>(me.sex ?? 'male');
  const [birthDate, setBirthDate] = useState(me.birthDate ?? '');
  const [heightCm, setHeightCm] = useState(me.heightCm ? String(me.heightCm) : '');
  const [feet, setFeet] = useState(me.heightCm ? String(Math.floor(me.heightCm / 2.54 / 12)) : '');
  const [inches, setInches] = useState(me.heightCm ? String(Math.round((me.heightCm / 2.54) % 12)) : '');
  const [weight, setWeight] = useState(
    me.latestWeightKg ? String(Math.round((lb ? me.latestWeightKg / KG_PER_LB : me.latestWeightKg) * 10) / 10) : '',
  );
  const [activity, setActivity] = useState<ActivityLevel>(me.activityLevel ?? 'moderate');
  const [goal, setGoal] = useState<Goal>(me.goal ?? 'lose');
  const [rate, setRate] = useState(me.goalRateKg ?? 0.5);
  const [targetWeight, setTargetWeight] = useState('');

  const imperial = units === 'imperial';
  const toKg = (v: number) => (imperial ? v * KG_PER_LB : v);
  const fromKg = (kg: number) => Math.round((imperial ? kg / KG_PER_LB : kg) * 10) / 10;
  const wUnit = imperial ? 'lb' : 'kg';

  const height = imperial ? ((Number(feet) || 0) * 12 + (Number(inches) || 0)) * 2.54 : Number(heightCm);
  const weightKg = toKg(Number(weight));
  const age = birthDate ? ageFrom(birthDate) : 0;
  const targetKg = targetWeight ? toKg(Number(targetWeight)) : null;

  const step0Valid = age >= 13 && age <= 100 && height >= 120 && height <= 250 && weightKg >= 30 && weightKg <= 300;
  const effectiveRate = goal === 'maintain' ? 0 : rate;

  const plan = useMemo(
    () =>
      step0Valid
        ? planTargets({ sex, weightKg, heightCm: height, age, activity, goal, rateKgPerWeek: effectiveRate })
        : null,
    [step0Valid, sex, weightKg, height, age, activity, goal, effectiveRate],
  );

  const weeksToGoal =
    targetKg && effectiveRate > 0 && ((goal === 'lose' && targetKg < weightKg) || (goal === 'gain' && targetKg > weightKg))
      ? Math.abs(weightKg - targetKg) / effectiveRate
      : null;
  const goalDate = weeksToGoal ? shiftDay(localDay(), Math.round(weeksToGoal * 7)) : null;

  const save = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error('Missing details');
      await api.put(`/body/${localDay()}`, { weightKg });
      if (goalDate && targetKg) {
        await api.post('/goals', {
          type: 'weight',
          title: `${goal === 'lose' ? 'Cut' : 'Bulk'} to ${fromKg(targetKg)} ${wUnit}`,
          targetValue: targetKg,
          deadline: goalDate,
        });
      }
      return api.patch<User>('/auth/me', {
        sex,
        birthDate,
        heightCm: Math.round(height * 10) / 10,
        activityLevel: activity,
        goal,
        goalRateKg: effectiveRate,
        calorieTarget: plan.calories,
        proteinTarget: plan.protein,
        carbsTarget: plan.carbs,
        fatTarget: plan.fat,
        weightUnit: imperial ? 'lb' : 'kg',
        distanceUnit: imperial ? 'mi' : 'km',
        onboarded: true,
      });
    },
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      toast(me.onboarded ? 'Targets updated' : 'You’re all set. Let’s go!');
      navigate('/', { replace: true });
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    window.scrollTo(0, 0);
  };
  const canNext = [step0Valid, true, true, true][step];

  return (
    <div className="grid-bg min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-8 pt-5 sm:px-6 sm:pt-10">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-sm text-muted">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        {/* Progress */}
        <div className="mt-6 grid grid-cols-4 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <div key={s} className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div className="h-full bg-brand" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
            </div>
          ))}
        </div>

        <div className="relative mt-8 flex-1">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: 24 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 * dir, transition: { duration: 0.12 } }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="label">{STEPS[step]}</p>

              {step === 0 && (
                <>
                  <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide">Tell us about you</h1>
                  <p className="mt-2 text-muted">We use this to calculate how many calories your body burns.</p>
                  <div className="mt-6 flex flex-col gap-5">
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-muted">Units</p>
                      <Segmented
                        label="Units"
                        value={units}
                        onChange={(u) => {
                          // Convert what's already typed so switching never loses input.
                          if (u !== units && weight) {
                            const kg = toKg(Number(weight));
                            setWeight(String(Math.round((u === 'imperial' ? kg / KG_PER_LB : kg) * 10) / 10));
                          }
                          if (u === 'imperial' && heightCm) {
                            const inTotal = Number(heightCm) / 2.54;
                            setFeet(String(Math.floor(inTotal / 12)));
                            setInches(String(Math.round(inTotal % 12)));
                          } else if (u === 'metric' && (feet || inches)) {
                            setHeightCm(String(Math.round(((Number(feet) || 0) * 12 + (Number(inches) || 0)) * 2.54)));
                          }
                          setUnits(u);
                        }}
                        options={[
                          { value: 'metric', label: 'kg · cm' },
                          { value: 'imperial', label: 'lb · ft' },
                        ]}
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-muted">Sex</p>
                      <Segmented
                        label="Sex"
                        value={sex}
                        onChange={setSex}
                        options={[
                          { value: 'male', label: 'Male' },
                          { value: 'female', label: 'Female' },
                        ]}
                      />
                      <p className="mt-1.5 text-xs text-subtle">Biological sex changes the metabolic formula.</p>
                    </div>
                    <Field label="Date of birth" hint={age > 0 ? `${age} years old` : undefined}>
                      {(id) => <Input id={id} type="date" max={shiftDay(localDay(), -365 * 13)} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />}
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      {imperial ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium text-muted">Height</span>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="relative">
                              <span className="sr-only">Feet</span>
                              <Input inputMode="numeric" value={feet} onChange={(e) => setFeet(e.target.value.replace(/\D/g, ''))} placeholder="5" className="num pr-8" />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">ft</span>
                            </label>
                            <label className="relative">
                              <span className="sr-only">Inches</span>
                              <Input inputMode="numeric" value={inches} onChange={(e) => setInches(e.target.value.replace(/\D/g, ''))} placeholder="10" className="num pr-8" />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">in</span>
                            </label>
                          </div>
                        </div>
                      ) : (
                        <UnitInput label="Height" unit="cm" value={heightCm} onChange={setHeightCm} placeholder="178" />
                      )}
                      <UnitInput label="Current weight" unit={wUnit} value={weight} onChange={setWeight} placeholder={imperial ? '180' : '82'} />
                    </div>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide">How active are you?</h1>
                  <p className="mt-2 text-muted">Count your job and daily movement, plus training.</p>
                  <div className="mt-6 flex flex-col gap-2.5" role="radiogroup" aria-label="Activity level">
                    {(Object.keys(ACTIVITY) as ActivityLevel[]).map((a) => {
                      const Icon = ACTIVITY_ICON[a];
                      const on = activity === a;
                      return (
                        <ChoiceCard key={a} on={on} onClick={() => setActivity(a)} icon={<Icon className="size-5" aria-hidden />} title={ACTIVITY[a].label} body={ACTIVITY[a].body}>
                          <span className={clsx('num text-sm font-semibold', on ? 'text-brand' : 'text-subtle')}>×{ACTIVITY[a].factor}</span>
                        </ChoiceCard>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide">What’s your goal?</h1>
                  <div className="mt-6 flex flex-col gap-2.5" role="radiogroup" aria-label="Goal">
                    {GOALS.map((g) => (
                      <ChoiceCard
                        key={g.value}
                        on={goal === g.value}
                        onClick={() => {
                          setGoal(g.value);
                          if (g.value !== 'maintain') setRate(RATES[g.value][1].kg);
                        }}
                        icon={<g.icon className="size-5" aria-hidden />}
                        title={g.label}
                        body={g.body}
                      />
                    ))}
                  </div>

                  {goal !== 'maintain' && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-col gap-5">
                      <div>
                        <p className="mb-2 text-sm font-medium text-muted">Pace</p>
                        <div className={clsx('grid gap-2', RATES[goal].length === 4 ? 'grid-cols-4' : 'grid-cols-3')} role="radiogroup" aria-label="Pace">
                          {RATES[goal].map((r) => {
                            const on = rate === r.kg;
                            return (
                              <button
                                key={r.kg}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setRate(r.kg)}
                                className={clsx(
                                  'flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-xl border px-1 transition-colors',
                                  on ? 'border-brand bg-brand/12 text-fg' : 'border-line-strong text-muted hover:text-fg',
                                )}
                              >
                                <span className="text-sm font-semibold">{r.label}</span>
                                <span className={clsx('num text-xs', on ? 'text-brand' : 'text-subtle')}>
                                  {fromKg(r.kg)} {wUnit}/wk
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="num mt-2 text-xs text-subtle">
                          ≈ {fmtInt((rate * KCAL_PER_KG) / 7)} kcal {goal === 'lose' ? 'deficit' : 'surplus'} per day
                          {goal === 'lose' && rate >= 1 && ' · hard to sustain, best for short phases'}
                        </p>
                      </div>
                      <UnitInput
                        label="Target weight (optional)"
                        unit={wUnit}
                        value={targetWeight}
                        onChange={setTargetWeight}
                        placeholder={weight ? String(Math.round(Number(weight) * (goal === 'lose' ? 0.92 : 1.05))) : ''}
                        hint="We’ll create a goal with a projected date."
                      />
                    </motion.div>
                  )}
                </>
              )}

              {step === 3 && plan && (
                <>
                  <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide">Your daily plan</h1>
                  <PlanSummary plan={plan} goal={goal} />
                  {goalDate && targetKg && (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-pr/30 bg-pr/5 p-4">
                      <Target className="size-5 shrink-0 text-pr" aria-hidden />
                      <p className="text-sm">
                        At {fromKg(effectiveRate)} {wUnit}/week you’ll reach <span className="font-semibold">{fromKg(targetKg)} {wUnit}</span> around{' '}
                        <span className="font-semibold text-pr">{fmtDay(goalDate, { month: 'long', day: 'numeric', year: 'numeric' })}</span>.
                      </p>
                    </div>
                  )}
                  {plan.floorApplied && (
                    <p className="mt-4 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
                      We kept you at a safe minimum of {fmtInt(plan.calories)} kcal. Consider a gentler pace.
                    </p>
                  )}
                  <p className="mt-4 text-xs text-subtle">
                    Estimates use the Mifflin-St Jeor equation. Weigh in regularly; if your trend doesn’t move as expected after 2–3 weeks, adjust by ~100–200 kcal. You
                    can recalculate any time in Settings.
                  </p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="sticky bottom-0 mt-8 flex gap-2 bg-gradient-to-t from-bg via-bg to-transparent pt-4 pb-safe">
          {step > 0 && (
            <Button variant="secondary" size="lg" onClick={() => go(step - 1)} icon={<ArrowLeft className="size-4" aria-hidden />}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button size="lg" className="flex-1" disabled={!canNext} onClick={() => go(step + 1)}>
              Continue <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button size="lg" className="flex-1" loading={save.isPending} onClick={() => save.mutate()} icon={<Flame className="size-4" aria-hidden />}>
              {me.onboarded ? 'Save new targets' : 'Start tracking'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function UnitInput({
  label,
  unit,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="relative">
          <Input
            id={id}
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
            placeholder={placeholder}
            className="num pr-10"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{unit}</span>
        </div>
      )}
    </Field>
  );
}

function ChoiceCard({
  on,
  onClick,
  icon,
  title,
  body,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={clsx(
        'flex min-h-16 w-full cursor-pointer items-center gap-4 rounded-2xl border p-4 text-left transition-colors duration-150',
        on ? 'border-brand bg-brand/10' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <span className={clsx('flex size-11 shrink-0 items-center justify-center rounded-xl', on ? 'bg-brand text-on-brand' : 'bg-surface-3 text-muted')}>{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{body}</span>
      </span>
      {children}
    </button>
  );
}

function PlanSummary({ plan, goal }: { plan: ReturnType<typeof planTargets>; goal: Goal }) {
  const max = Math.max(plan.tdee, plan.calories);
  const rows = [
    { label: 'Resting burn (BMR)', value: plan.bmr, color: 'var(--color-surface-3)', text: 'Calories your body uses at complete rest' },
    { label: 'Daily burn (TDEE)', value: plan.tdee, color: 'var(--color-brand-deep)', text: 'BMR plus your activity level' },
    {
      label: goal === 'maintain' ? 'Your target' : `Target (${plan.adjustment > 0 ? '+' : ''}${fmtInt(plan.adjustment)} for your goal)`,
      value: plan.calories,
      color: 'var(--color-brand)',
      text: goal === 'lose' ? 'Eat this to lose at your chosen pace' : goal === 'gain' ? 'Eat this to gain at your chosen pace' : 'Eat this to hold your weight',
    },
  ];
  const macros = [
    { label: 'Protein', g: plan.protein, kcal: plan.protein * 4, color: 'var(--color-protein)' },
    { label: 'Carbs', g: plan.carbs, kcal: plan.carbs * 4, color: 'var(--color-carbs)' },
    { label: 'Fat', g: plan.fat, kcal: plan.fat * 9, color: 'var(--color-fat)' },
  ];
  const macroTotal = macros.reduce((n, m) => n + m.kcal, 0) || 1;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="card glow p-5 text-center">
        <p className="label">Daily calories</p>
        <motion.p
          className="num font-display text-7xl font-bold leading-none text-brand"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          {fmtInt(plan.calories)}
        </motion.p>
        <p className="mt-1 text-sm text-muted">kcal per day</p>
      </div>

      <div className="card p-5">
        <ul className="flex flex-col gap-4">
          {rows.map((r, i) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="num font-display text-xl font-semibold">{fmtInt(r.value)}</span>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-bg">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: r.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.value / max) * 100}%` }}
                  transition={{ delay: 0.15 + i * 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">{r.text}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5">
        <p className="label mb-3">Macros</p>
        <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={macros.map((m) => `${m.label} ${m.g} grams`).join(', ')}>
          {macros.map((m, i) => (
            <motion.span
              key={m.label}
              style={{ background: m.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(m.kcal / macroTotal) * 100}%` }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.6 }}
              className="h-full border-r-2 border-surface last:border-r-0"
            />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {macros.map((m) => (
            <div key={m.label} className="rounded-xl bg-surface-2 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <span className="size-2 rounded-full" style={{ background: m.color }} />
                {m.label}
              </p>
              <p className="num mt-1 font-display text-2xl font-semibold">
                {m.g}
                <span className="text-sm text-muted">g</span>
              </p>
              <p className="num text-xs text-subtle">{Math.round((m.kcal / macroTotal) * 100)}%</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
