import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import clsx from 'clsx';
import {
  ACTIVITY,
  ADAPTIVE_MAX_STEP,
  ADAPTIVE_MIN_LOGGED_DAYS,
  ADAPTIVE_WINDOW_DAYS,
  KCAL_PER_KG,
  ageFrom,
  planTargets,
  profileFor,
  restingKcalPerMin,
} from '../lib/energy';
import { fmtInt, useMe, useUnits } from '../lib/format';
import { IconButton, Sheet } from './ui';

/** Which number the "i" explains. Formulas live in lib/energy.ts (full detail in docs/CALORIES.md); keep this text in sync. */
export type CalorieTopic = 'target' | 'burn' | 'adaptive';

const LABEL: Record<CalorieTopic, string> = {
  target: 'How your calorie target is set',
  burn: 'How calories burned are estimated',
  adaptive: 'How the adaptive target works',
};

const TITLE: Record<CalorieTopic, string> = {
  target: 'Calorie target',
  burn: 'Calories burned',
  adaptive: 'Adaptive target',
};

/** Small "i" button (44px tap area, no extra layout space) that opens a short explanation of a calorie number. */
export function CalorieInfo({ topic, className, personal = true }: { topic: CalorieTopic; className?: string; personal?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label={LABEL[topic]}
        className={clsx('-m-3 text-subtle', className)}
        onClick={(e) => {
          // The sheet is portalled, but React events still bubble to a parent link or card.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Info className="size-4" aria-hidden />
      </IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title={TITLE[topic]}>
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          {topic === 'target' && <TargetInfo personal={personal} />}
          {topic === 'burn' && <BurnInfo />}
          {topic === 'adaptive' && <AdaptiveInfo />}
        </div>
      </Sheet>
    </>
  );
}

/** A label / value row; the last row of a calculation is the result. */
function Rows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="num divide-y divide-line rounded-xl bg-surface-2 px-3 text-fg">
      {rows.map(([label, value], i) => (
        <div key={i} className={clsx('flex justify-between gap-3 py-2', i === rows.length - 1 && 'font-semibold')}>
          <dt className={i === rows.length - 1 ? 'text-fg' : 'text-muted'}>{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const Source = ({ children }: { children: ReactNode }) => <p className="text-xs text-subtle">{children}</p>;

/** `personal={false}` (the setup wizard) shows only the steps: the saved profile may not match the plan on screen yet. */
function TargetInfo({ personal }: { personal: boolean }) {
  const { data: me } = useMe();
  const age = me?.birthDate ? ageFrom(me.birthDate) : null;
  const weightKg = me?.latestWeightKg;
  const plan =
    personal && me?.sex && age && me.heightCm && weightKg && me.activityLevel && me.goal
      ? planTargets({
          sex: me.sex,
          weightKg,
          heightCm: me.heightCm,
          age,
          activity: me.activityLevel,
          goal: me.goal,
          rateKgPerWeek: me.goalRateKg ?? 0,
        })
      : null;
  const goalLabel = me?.goal === 'maintain' || !me?.goal ? 'Goal' : `Goal (${me.goal} ${me.goalRateKg ?? 0} kg/week)`;

  return (
    <>
      <Rows
        rows={[
          ['Resting burn (weight, height, age, sex)', plan ? fmtInt(plan.bmr) : '—'],
          [`× activity${plan ? ` (${ACTIVITY[me!.activityLevel!].factor})` : ''}`, plan ? fmtInt(plan.tdee) : '—'],
          [goalLabel, plan ? `${plan.adjustment > 0 ? '+' : plan.adjustment < 0 ? '−' : ''}${fmtInt(Math.abs(plan.adjustment))}` : '—'],
          ['Daily target', plan ? `${fmtInt(plan.calories)} kcal` : '—'],
        ]}
      />
      {plan && me && plan.calories !== me.calorieTarget && <p>You’re using {fmtInt(me.calorieTarget)} kcal, set in Settings or by the adaptive target.</p>}
      {personal && !plan && <p>Finish setup and log a weigh-in to see your numbers.</p>}
      <Source>Mifflin-St Jeor equation, the most accurate common formula. 1 kg ≈ {fmtInt(KCAL_PER_KG)} kcal.</Source>
    </>
  );
}

function BurnInfo() {
  const { data: me } = useMe();
  const u = useUnits();
  const profile = profileFor(me);

  return (
    <>
      <p>Uses the best data your entry has:</p>
      <ol className="list-decimal space-y-1 pl-5 text-fg">
        <li>Heart rate, if you entered one</li>
        <li>Speed and incline, for walks and runs</li>
        <li>Otherwise, the activity type and time</li>
      </ol>
      <Rows
        rows={[
          ['Your weight', `${u.weight(profile.weightKg)} ${u.w}${me?.latestWeightKg == null ? ' (default)' : ''}`],
          ['Your resting burn', `${restingKcalPerMin(profile).toFixed(2)} kcal/min`],
        ]}
      />
      <Source>Keytel (2005), ACSM equations and the 2024 Compendium of Physical Activities. Estimates; not added to your food budget.</Source>
    </>
  );
}

function AdaptiveInfo() {
  return (
    <>
      <p className="text-fg">Your real daily burn = what you ate − how your weight changed.</p>
      <p>
        From the last {ADAPTIVE_WINDOW_DAYS} days, once you have {ADAPTIVE_MIN_LOGGED_DAYS} days of food and a few weigh-ins. The target moves at
        most {ADAPTIVE_MAX_STEP} kcal at a time.
      </p>
      <Source>1 kg ≈ {fmtInt(KCAL_PER_KG)} kcal.</Source>
    </>
  );
}
