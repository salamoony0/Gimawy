import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Gauge } from 'lucide-react';
import { api, type BodyWeight, type User } from '../lib/api';
import {
  ADAPTIVE_MIN_LOGGED_DAYS,
  ADAPTIVE_MIN_WEIGH_INS,
  ADAPTIVE_MIN_WEIGH_SPAN_DAYS,
  ADAPTIVE_WINDOW_DAYS,
  adaptiveTargets,
  type AdaptiveResult,
} from '../lib/energy';
import { fmtInt, localDay, shiftDay, useUnits } from '../lib/format';
import { Bar, Button, useToast } from './ui';

/** Automatic adjustments happen at most this often. */
const AUTO_EVERY_DAYS = 7;
/** Changes smaller than this aren't worth bothering the user with. */
const MIN_CHANGE = 50;

/** The adaptive TDEE estimate for the signed-in user, from the last 28 days of food logs and weigh-ins. */
export function useAdaptive(me: User | undefined): AdaptiveResult | null {
  const today = localDay();
  const from = shiftDay(today, -ADAPTIVE_WINDOW_DAYS);
  const { data: intake } = useQuery({
    queryKey: ['food-summary', from, today],
    queryFn: () => api.get<{ date: string; calories: number }[]>(`/food/summary?from=${from}&to=${today}`),
    enabled: Boolean(me),
  });
  const { data: weighIns } = useQuery({ queryKey: ['body'], queryFn: () => api.get<BodyWeight[]>('/body'), enabled: Boolean(me) });
  if (!me || !intake || !weighIns) return null;
  return adaptiveTargets({
    today,
    intake,
    weighIns,
    currentTarget: me.calorieTarget,
    sex: me.sex,
    goal: me.goal,
    rateKgPerWeek: me.goalRateKg,
  });
}

function useApplyTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<User>) => api.patch<User>('/auth/me', body),
    onSuccess: (u) => qc.setQueryData(['me'], u),
  });
}

const daysSince = (day: string | null) => (day ? (Date.parse(localDay()) - Date.parse(day)) / 86_400_000 : Infinity);

/** Headless: with auto-adjust on, applies the suggestion once a week. Mounted in the signed-in layout. */
export function AutoAdjustTargets({ me }: { me: User }) {
  const result = useAdaptive(me);
  const apply = useApplyTargets();
  const toast = useToast();
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current || !result || result.status !== 'ready') return;
    if (daysSince(me.targetsAdjustedAt) < AUTO_EVERY_DAYS || Math.abs(result.change) < MIN_CHANGE) return;
    tried.current = true;
    const { calories, protein, carbs, fat } = result.suggested;
    apply.mutate(
      { calorieTarget: calories, proteinTarget: protein, carbsTarget: carbs, fatTarget: fat, targetsAdjustedAt: localDay() },
      { onSuccess: () => toast(`Calorie target adjusted to ${fmtInt(calories)} kcal (${result.change > 0 ? '+' : ''}${result.change}) from your last 4 weeks`) },
    );
  }, [result, me.targetsAdjustedAt, apply, toast]);

  return null;
}

export function AutoAdjustToggle({ me }: { me: User }) {
  const apply = useApplyTargets();
  // Local state flips in the same event (mutation state only updates on the next tick, which made the box flicker).
  const [pending, setPending] = useState<boolean | null>(null);
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line p-3">
      <input
        type="checkbox"
        checked={pending ?? me.autoAdjustTargets}
        onChange={(e) => {
          setPending(e.target.checked);
          apply.mutate({ autoAdjustTargets: e.target.checked }, { onSettled: () => setPending(null) });
        }}
        className="size-5 accent-[var(--color-brand)]"
      />
      <span>
        <span className="block text-sm font-semibold">Adjust my targets automatically</span>
        <span className="block text-xs text-muted">Once a week, from what you ate and how your weight moved. At most ±250 kcal at a time.</span>
      </span>
    </label>
  );
}

/** Food page card: what the data says about maintenance, and a one-tap way to use it. */
export function AdaptiveCard({ me }: { me: User }) {
  const result = useAdaptive(me);
  const apply = useApplyTargets();
  const toast = useToast();
  const u = useUnits();
  if (!result) return null;

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-wide">
        <Gauge className="size-5 text-brand" aria-hidden /> Adaptive target
      </h2>
      {result.status === 'collecting' ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Keep logging. After {ADAPTIVE_MIN_LOGGED_DAYS} days of food and a few weigh-ins, your real maintenance calories are worked out from your own
            numbers instead of a formula.
          </p>
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <Progress label="Days with food logged" value={result.loggedDays} target={ADAPTIVE_MIN_LOGGED_DAYS} />
            <Progress label="Weigh-ins" value={result.weighIns} target={ADAPTIVE_MIN_WEIGH_INS} />
            <Progress label="Days between first and last weigh-in" value={result.weighSpanDays} target={ADAPTIVE_MIN_WEIGH_SPAN_DAYS} />
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="label">Your maintenance</p>
              <p className="num font-display text-2xl font-semibold">{fmtInt(result.tdee)}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="label">Suggested target</p>
              <p className={clsx('num font-display text-2xl font-semibold', result.change !== 0 && 'text-brand')}>{fmtInt(result.suggested.calories)}</p>
            </div>
          </div>
          <p className="num mt-3 text-xs text-muted">
            Last {ADAPTIVE_WINDOW_DAYS} days: {result.loggedDays} logged days averaging {fmtInt(result.avgIntake)} kcal, weight{' '}
            {result.weightChangePerWeek === 0
              ? 'steady'
              : `${result.weightChangePerWeek > 0 ? '+' : '−'}${u.weight(Math.abs(result.weightChangePerWeek), 2)} ${u.w}/week`}
            .{result.idealTarget !== result.suggested.calories && ` Heading toward ${fmtInt(result.idealTarget)} kcal in steps of up to 250.`}
          </p>
          {Math.abs(result.change) >= MIN_CHANGE ? (
            <Button
              className="mt-4 w-full"
              loading={apply.isPending}
              onClick={() => {
                const { calories, protein, carbs, fat } = result.suggested;
                apply.mutate(
                  { calorieTarget: calories, proteinTarget: protein, carbsTarget: carbs, fatTarget: fat, targetsAdjustedAt: localDay() },
                  { onSuccess: () => toast(`Target set to ${fmtInt(calories)} kcal`) },
                );
              }}
            >
              Use {fmtInt(result.suggested.calories)} kcal ({result.change > 0 ? '+' : ''}
              {result.change})
            </Button>
          ) : (
            <p className="mt-4 rounded-xl bg-brand/10 px-3 py-2 text-sm text-brand">Your current target of {fmtInt(me.calorieTarget)} kcal is on track.</p>
          )}
        </>
      )}
      <div className="mt-4">
        <AutoAdjustToggle me={me} />
      </div>
    </section>
  );
}

function Progress({ label, value, target }: { label: string; value: number; target: number }) {
  return (
    <div>
      <p className="num mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>
          {Math.min(value, target)}/{target}
        </span>
      </p>
      <Bar value={Math.min(1, value / target)} label={`${label}: ${value} of ${target}`} />
    </div>
  );
}
