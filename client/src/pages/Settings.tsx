import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Calculator, Download, KeyRound, LogOut, MonitorSmartphone, ShieldCheck, Sparkles, Trash } from 'lucide-react';
import { ACTIVITY, ageFrom } from '../lib/energy';
import { api, type User } from '../lib/api';
import { useMe } from '../lib/format';
import { PageHeader } from '../components/Layout';
import { Button, buttonClass, Card, Field, Input, Segmented, Sheet, Skeleton, useToast } from '../components/ui';

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

        <SecurityCard email={me.email} />

        <Button variant="danger" size="lg" icon={<LogOut className="size-4" aria-hidden />} loading={logout.isPending} onClick={() => logout.mutate()}>
          Log out
        </Button>
      </div>
    </div>
  );
}

const DEMO_EMAIL = 'demo@gymawy.app';

function SecurityCard({ email }: { email: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<'password' | 'delete' | null>(null);
  const close = () => setSheet(null);
  const signedOut = (message: string) => {
    qc.clear();
    navigate('/login', { replace: true });
    toast(message);
  };

  const exportData = useMutation({
    mutationFn: () => api.download('/auth/export'),
    onError: (e) => toast(e.message, 'error'),
  });
  const logoutAll = useMutation({
    mutationFn: () => api.post('/auth/logout-all'),
    onSuccess: () => signedOut('Signed out on every device'),
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-semibold tracking-wide">
        <ShieldCheck className="size-5 text-brand" aria-hidden /> Account & security
      </h2>
      <p className="mb-4 text-sm text-muted">
        {email === DEMO_EMAIL ? 'This is the shared demo account, so its password can’t be changed and it can’t be deleted.' : 'Signed in as ' + email}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="secondary" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => setSheet('password')}>
          Change password
        </Button>
        <Button variant="secondary" icon={<Download className="size-4" aria-hidden />} loading={exportData.isPending} onClick={() => exportData.mutate()}>
          Export my data
        </Button>
        <Button variant="secondary" icon={<MonitorSmartphone className="size-4" aria-hidden />} loading={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
          Log out everywhere
        </Button>
        <Button variant="danger" icon={<Trash className="size-4" aria-hidden />} onClick={() => setSheet('delete')}>
          Delete account
        </Button>
      </div>
      <PasswordSheet open={sheet === 'password'} onClose={close} />
      <DeleteAccountSheet open={sheet === 'delete'} onClose={close} onDeleted={() => signedOut('Your account and data were deleted')} />
    </Card>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '' });
  const change = useMutation({
    mutationFn: () => api.patch('/auth/password', f),
    onSuccess: () => {
      toast('Password changed. Other devices were signed out.');
      setF({ current: '', next: '' });
      onClose();
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Change password"
      footer={
        <Button size="lg" className="w-full" loading={change.isPending} disabled={!f.current || f.next.length < 8} onClick={() => change.mutate()}>
          Change password
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Current password">
          {(id) => <Input id={id} type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />}
        </Field>
        <Field label="New password" hint="At least 8 characters. Other devices will be signed out.">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />}
        </Field>
        {change.error && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {change.error.message}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function DeleteAccountSheet({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const del = useMutation({ mutationFn: () => api.del('/auth/me', { password }), onSuccess: onDeleted });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Delete account"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" loading={del.isPending} disabled={typed !== 'DELETE' || !password} onClick={() => del.mutate()}>
            Delete forever
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted">
          This permanently deletes your account and every workout, meal, weigh-in and goal. It can’t be undone. Export your data first if you want a copy.
        </p>
        <Field label="Password">
          {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Type DELETE to confirm">
          {(id) => <Input id={id} autoCapitalize="characters" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />}
        </Field>
        {del.error && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {del.error.message}
          </p>
        )}
      </div>
    </Sheet>
  );
}
