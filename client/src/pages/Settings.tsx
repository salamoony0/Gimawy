import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Calculator, LogOut, Sparkles } from 'lucide-react';
import { ACTIVITY, ageFrom } from '../lib/energy';
import { api, type User } from '../lib/api';
import { useMe } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Button, buttonClass, Card, Field, Input, Segmented, Skeleton, useToast } from '../components/ui';

type Form = {
  name: string;
  weightUnit: User['weightUnit'];
  distanceUnit: User['distanceUnit'];
  heightCm: string;
  calorieTarget: string;
  proteinTarget: string;
  carbsTarget: string;
  fatTarget: string;
  weeklyWorkoutTarget: string;
};

function toForm(u: User): Form {
  return {
    name: u.name,
    weightUnit: u.weightUnit,
    distanceUnit: u.distanceUnit,
    heightCm: u.heightCm ? String(u.heightCm) : '',
    calorieTarget: String(u.calorieTarget),
    proteinTarget: String(u.proteinTarget),
    carbsTarget: String(u.carbsTarget),
    fatTarget: String(u.fatTarget),
    weeklyWorkoutTarget: String(u.weeklyWorkoutTarget),
  };
}

export default function Settings() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<Form | null>(null);
  const { data: ai } = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<{ enabled: boolean; model: string }>('/ai/status') });

  useEffect(() => {
    if (me && !f) setF(toForm(me));
  }, [me, f]);

  const save = useMutation({
    mutationFn: (body: Partial<User>) => api.patch<User>('/auth/me', body),
    onSuccess: (u) => {
      qc.setQueryData(['me'], u);
      toast('Settings saved');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      qc.clear();
      navigate('/login', { replace: true });
    },
  });

  if (!f || !me) return <Skeleton className="h-96" />;

  const macroKcal = (Number(f.proteinTarget) || 0) * 4 + (Number(f.carbsTarget) || 0) * 4 + (Number(f.fatTarget) || 0) * 9;
  const kcalGap = macroKcal - (Number(f.calorieTarget) || 0);

  const submit = () =>
    save.mutate({
      name: f.name.trim(),
      weightUnit: f.weightUnit,
      distanceUnit: f.distanceUnit,
      heightCm: f.heightCm ? Number(f.heightCm) : null,
      calorieTarget: Math.round(Number(f.calorieTarget)),
      proteinTarget: Math.round(Number(f.proteinTarget)),
      carbsTarget: Math.round(Number(f.carbsTarget)),
      fatTarget: Math.round(Number(f.fatTarget)),
      weeklyWorkoutTarget: Math.round(Number(f.weeklyWorkoutTarget)),
    });

  const num = (k: keyof Form, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id) => (
        <Input id={id} inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') })} className="num" />
      )}
    </Field>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow={me.email} title="Settings" />
      <div className="flex flex-col gap-5">
        <Card>
          <h2 className="mb-4 font-display text-xl font-semibold tracking-wide">Units</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-sm font-medium text-muted">Weight</p>
              <Segmented
                label="Weight unit"
                value={f.weightUnit}
                onChange={(v) => {
                  setF({ ...f, weightUnit: v });
                  save.mutate({ weightUnit: v });
                }}
                options={[
                  { value: 'kg', label: 'Kilograms' },
                  { value: 'lb', label: 'Pounds' },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-muted">Distance</p>
              <Segmented
                label="Distance unit"
                value={f.distanceUnit}
                onChange={(v) => {
                  setF({ ...f, distanceUnit: v });
                  save.mutate({ distanceUnit: v });
                }}
                options={[
                  { value: 'km', label: 'Kilometers' },
                  { value: 'mi', label: 'Miles' },
                ]}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-subtle">Everything is stored in metric, so switching never loses precision.</p>
        </Card>

        <Card className="glow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-wide">Body & goal</h2>
              <p className="text-sm text-muted">
                {me.sex ? `${me.sex === 'male' ? 'Male' : 'Female'} · ` : ''}
                {me.birthDate ? `${ageFrom(me.birthDate)} yrs · ` : ''}
                {me.heightCm ? `${me.heightCm} cm · ` : ''}
                {me.activityLevel ? ACTIVITY[me.activityLevel].label : 'Not set'}
                {me.goal ? ` · ${me.goal === 'lose' ? 'Lose fat' : me.goal === 'gain' ? 'Build muscle' : 'Maintain'}` : ''}
              </p>
            </div>
            <Link to="/setup" className={buttonClass('primary', 'sm')}>
              <Calculator className="size-4" aria-hidden /> Recalculate targets
            </Link>
          </div>
          <p className="mt-3 text-xs text-subtle">Recalculate after your weight changes a few kg, or when your activity changes.</p>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-xl font-semibold tracking-wide">Daily targets</h2>
          <div className="grid grid-cols-2 gap-4">
            {num('calorieTarget', 'Calories (kcal)')}
            {num('weeklyWorkoutTarget', 'Workouts per week')}
            {num('proteinTarget', 'Protein (g)')}
            {num('carbsTarget', 'Carbs (g)')}
            {num('fatTarget', 'Fat (g)')}
          </div>
          <p
            className={clsx(
              'num mt-4 rounded-xl px-3 py-2 text-sm',
              Math.abs(kcalGap) <= 100 ? 'bg-brand/10 text-brand' : 'bg-warn/10 text-warn',
            )}
          >
            Your macros add up to {macroKcal.toLocaleString()} kcal
            {Math.abs(kcalGap) > 100 && ` (${kcalGap > 0 ? '+' : ''}${kcalGap} vs your calorie target)`}.
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-xl font-semibold tracking-wide">Profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
            {num('heightCm', 'Height (cm)', 'Used for BMI')}
          </div>
        </Card>

        <Button size="lg" loading={save.isPending} onClick={submit}>
          Save changes
        </Button>

        <Card className="flex items-start gap-3">
          <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl', ai?.enabled ? 'bg-brand/15 text-brand' : 'bg-warn/15 text-warn')}>
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">AI meal scanning {ai?.enabled ? 'is on' : 'is off'}</p>
            <p className="text-sm text-muted">
              {ai?.enabled
                ? `Using Google Gemini (${ai.model}) on the free tier.`
                : 'Add a free GEMINI_API_KEY to server/.env to enable photo, label and screenshot scanning.'}
            </p>
          </div>
        </Card>

        <Button variant="danger" size="lg" icon={<LogOut className="size-4" aria-hidden />} loading={logout.isPending} onClick={() => logout.mutate()}>
          Log out
        </Button>
      </div>
    </div>
  );
}
