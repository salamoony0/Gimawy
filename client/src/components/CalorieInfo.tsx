import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import clsx from 'clsx';
import type { CardioType } from '../lib/api';
import {
  ACTIVITY,
  ADAPTIVE_MAX_STEP,
  ADAPTIVE_MIN_LOGGED_DAYS,
  ADAPTIVE_MIN_WEIGH_INS,
  ADAPTIVE_MIN_WEIGH_SPAN_DAYS,
  ADAPTIVE_PARTIAL_DAY,
  ADAPTIVE_WINDOW_DAYS,
  CARDIO_MET,
  KCAL_PER_KG,
  STRENGTH_MET,
  ageFrom,
  calorieFloor,
  goalAdjustment,
  planTargets,
  profileFor,
  restingKcalPerMin,
} from '../lib/energy';
import { fmtInt, useMe, useUnits } from '../lib/format';
import { IconButton, Sheet } from './ui';

/** Which number the "i" explains. Every formula lives in lib/energy.ts and docs/CALORIES.md; keep this text in sync. */
export type CalorieTopic = 'target' | 'burn' | 'adaptive';

const TITLE: Record<CalorieTopic, string> = {
  target: 'How your calorie target is set',
  burn: 'How calories burned are estimated',
  adaptive: 'How the adaptive target works',
};

/** Small "i" button (44px tap area, no extra layout space) that opens the formulas behind a calorie number. */
export function CalorieInfo({ topic, className, personal = true }: { topic: CalorieTopic; className?: string; personal?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        label={TITLE[topic]}
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
        <div className="space-y-4 text-sm leading-relaxed text-muted">
          {topic === 'target' && <TargetInfo personal={personal} />}
          {topic === 'burn' && <BurnInfo />}
          {topic === 'adaptive' && <AdaptiveInfo />}
        </div>
      </Sheet>
    </>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <p className="num rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-fg">{children}</p>;
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-display text-base font-semibold tracking-wide text-fg">{title}</h3>
      {children}
    </section>
  );
}

function Yours({ children }: { children: ReactNode }) {
  return <p className="num text-brand">{children}</p>;
}

/** `personal={false}` (the setup wizard) shows only the formulas: the saved profile may not match the plan on screen yet. */
function TargetInfo({ personal }: { personal: boolean }) {
  const { data: me } = useMe();
  const u = useUnits();
  const age = me?.birthDate ? ageFrom(me.birthDate) : null;
  const weightKg = me?.latestWeightKg;
  const ready = personal && me?.sex && age && me.heightCm && weightKg && me.activityLevel && me.goal;
  const plan = ready
    ? planTargets({
        sex: me.sex!,
        weightKg: weightKg!,
        heightCm: me.heightCm!,
        age: age!,
        activity: me.activityLevel!,
        goal: me.goal!,
        rateKgPerWeek: me.goalRateKg ?? 0,
      })
    : null;
  const adjustment = Math.round(goalAdjustment(me?.goal, me?.goalRateKg));

  return (
    <>
      <p>Your daily target is your estimated daily burn, minus (or plus) the calories your weekly goal needs.</p>
      <Step title="1. Resting burn (BMR): Mifflin-St Jeor">
        <Formula>10 × weight (kg) + 6.25 × height (cm) − 5 × age + 5 (men) or − 161 (women)</Formula>
        {plan && (
          <Yours>
            Yours: 10 × {fmtInt(weightKg!)} + 6.25 × {fmtInt(me!.heightCm!)} − 5 × {age} {me!.sex === 'male' ? '+ 5' : '− 161'} ={' '}
            {fmtInt(plan.bmr)} kcal
          </Yours>
        )}
      </Step>
      <Step title="2. Daily burn (TDEE): BMR × activity">
        <Formula>
          {Object.values(ACTIVITY)
            .map((a) => `${a.label} ${a.factor}`)
            .join(' · ')}
        </Formula>
        {plan && (
          <Yours>
            Yours: {fmtInt(plan.bmr)} × {ACTIVITY[me!.activityLevel!].factor} = {fmtInt(plan.tdee)} kcal
          </Yours>
        )}
      </Step>
      <Step title="3. Goal">
        <Formula>± pace (kg/week) × {fmtInt(KCAL_PER_KG)} kcal per kg ÷ 7 days</Formula>
        <p>
          Never below {fmtInt(calorieFloor('male'))} kcal for men or {fmtInt(calorieFloor('female'))} kcal for women. Rounded to the
          nearest 10.
        </p>
        {plan && (
          <Yours>
            Yours: {fmtInt(plan.tdee)} {adjustment < 0 ? '−' : '+'} {fmtInt(Math.abs(adjustment))} = {fmtInt(plan.calories)} kcal
            {plan.floorApplied && ' (raised to the minimum)'}
          </Yours>
        )}
      </Step>
      <Step title="Macros">
        <Formula>Protein {me?.goal === 'lose' ? '2.2' : '1.8'} g per kg · fat 25% of calories · carbs the rest</Formula>
      </Step>
      {plan && me && plan.calories !== me.calorieTarget && (
        <p>
          Your current target is {fmtInt(me.calorieTarget)} kcal, because you set it yourself in Settings or the adaptive target
          changed it.
        </p>
      )}
      {personal && !weightKg && <p>Log a weigh-in on Body to see your own numbers here.</p>}
      <Step title="Why this formula">
        <p>
          Mifflin-St Jeor (1990) was the most accurate of the common equations in the Academy of Nutrition and Dietetics review
          (Frankenfield 2005), within 10% for most adults. Every formula is an estimate, so after a few weeks of logging food and
          weigh-ins, the adaptive target on Food measures your real daily burn.
        </p>
      </Step>
      {u.w === 'lb' && <p className="text-xs text-subtle">The formulas use kg and cm; your entries are converted.</p>}
    </>
  );
}

const CARDIO_NAME: Record<CardioType, string> = {
  run: 'Run',
  walk: 'Walk',
  incline: 'Incline walk',
  cycle: 'Cycle',
  row: 'Row',
  swim: 'Swim',
  elliptical: 'Elliptical',
  stairs: 'Stairs',
  hiit: 'HIIT',
  other: 'Other',
};

function BurnInfo() {
  const { data: me } = useMe();
  const u = useUnits();
  const profile = profileFor(me);
  const personal = Boolean(profile.sex && profile.age && profile.heightCm);
  const rest = restingKcalPerMin(profile);

  return (
    <>
      <p>Gymawy picks the most accurate method your entry allows:</p>
      <Step title="1. Heart rate: Keytel et al. (2005)">
        <p>When you enter an average heart rate (and your age and sex are set). Uses heart rate, weight, age and sex.</p>
        <Formula>
          Men: (−55.10 + 0.631 × HR + 0.199 × kg + 0.202 × age) ÷ 4.184 per min
          <br />
          Women: (−20.40 + 0.447 × HR − 0.126 × kg + 0.074 × age) ÷ 4.184 per min
        </Formula>
      </Step>
      <Step title="2. Speed and incline: ACSM equations">
        <p>Walks, runs and incline walks with a speed. The oxygen cost of moving your body at that speed and grade.</p>
        <Formula>
          Walking O₂ = 0.1 × m/min + 1.8 × m/min × grade + 3.5
          <br />
          Running O₂ = 0.2 × m/min + 0.9 × m/min × grade + 3.5
          <br />
          kcal = O₂ (ml/kg/min) × kg ÷ 1000 × 5 × minutes
        </Formula>
      </Step>
      <Step title="3. MET: 2024 Compendium of Physical Activities">
        <p>Everything else, including strength workouts (time from start to finish).</p>
        <Formula>kcal = MET × your resting burn per minute × minutes</Formula>
        <div className="num grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-fg">
          <span>Strength workout</span>
          <span className="text-right">{STRENGTH_MET}</span>
          {(Object.keys(CARDIO_MET) as CardioType[]).map((t) => (
            <span key={t} className="contents">
              <span>{CARDIO_NAME[t]}</span>
              <span className="text-right">{CARDIO_MET[t]}</span>
            </span>
          ))}
        </div>
      </Step>
      <Step title="Your numbers">
        <Yours>
          Weight: {u.weight(profile.weightKg)} {u.w}
          {me?.latestWeightKg == null && ' (default; log a weigh-in on Body)'}
        </Yours>
        <Yours>
          Resting burn: {rest.toFixed(2)} kcal/min{' '}
          {personal ? '(your BMR from weight, height, age and sex ÷ 1,440)' : '(standard 3.5 ml O₂/kg/min, since your height, age or sex is missing)'}
        </Yours>
      </Step>
      <Step title="Good to know">
        <p>
          These are estimates: for one person they can easily be 10–20% off, and a heart rate reading makes them closer. They include the calories
          you'd burn at rest anyway. They are not added to your food budget, because your daily target already counts your activity
          level. Saved sessions keep the number calculated when you logged them.
        </p>
      </Step>
    </>
  );
}

function AdaptiveInfo() {
  return (
    <>
      <p>Instead of guessing your daily burn, this measures it from what you ate and how your weight actually moved.</p>
      <Formula>
        Real daily burn = average calories eaten − weight change per day × {fmtInt(KCAL_PER_KG)}
        <br />
        New target = real daily burn ± your goal, moved at most {ADAPTIVE_MAX_STEP} kcal at a time
      </Formula>
      <Step title="Rules">
        <ul className="list-disc space-y-1 pl-5">
          <li>Uses the last {ADAPTIVE_WINDOW_DAYS} days, not counting today.</li>
          <li>Days under {Math.round(ADAPTIVE_PARTIAL_DAY * 100)}% of your target count as "forgot to log" and are skipped.</li>
          <li>
            Needs {ADAPTIVE_MIN_LOGGED_DAYS} logged days and {ADAPTIVE_MIN_WEIGH_INS} weigh-ins spread over {ADAPTIVE_MIN_WEIGH_SPAN_DAYS}{' '}
            days.
          </li>
          <li>Weight change is a best-fit line through all your weigh-ins, so one heavy or light morning barely matters.</li>
          <li>{fmtInt(KCAL_PER_KG)} kcal ≈ 1 kg of body weight. Never below the safe minimum.</li>
        </ul>
      </Step>
      <p>This is the same energy-balance method used in metabolic research and by coaches: intake minus the change in body stores.</p>
    </>
  );
}
