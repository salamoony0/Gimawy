import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Camera, ChartLine, Dumbbell, Scale } from 'lucide-react';
import { api, type User } from '../lib/api';
import { Logo } from '../components/Layout';
import { Button, Field, Input } from '../components/ui';
import { Rings } from '../components/viz';

const FEATURES = [
  { icon: Dumbbell, title: 'Every set, every PR', body: 'Log lifts fast, with last session’s numbers right beside you.' },
  { icon: Camera, title: 'Snap your meal', body: 'AI reads labels, screenshots and plates, then fills in your macros.' },
  { icon: Scale, title: 'Weight that makes sense', body: 'A 7-day trend line cuts through daily water swings.' },
  { icon: ChartLine, title: 'See the progress', body: 'Strength curves, muscle balance, cardio and streaks.' },
];

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const isLogin = mode === 'login';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const submit = useMutation({
    mutationFn: (body: typeof form) => api.post<User>(isLogin ? '/auth/login' : '/auth/register', body),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      navigate(user.onboarded ? '/' : '/setup', { replace: true });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate(form);
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="grid-bg relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full bg-brand/10 blur-3xl" aria-hidden />
        <Logo className="relative" />
        <div className="relative">
          <h1 className="font-display text-7xl font-bold uppercase leading-[0.9] tracking-wide">
            Train hard.
            <br />
            <span className="text-brand">Track smarter.</span>
          </h1>
          <ul className="mt-10 grid max-w-xl grid-cols-2 gap-5">
            {FEATURES.map(({ icon: Icon, title, body }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.07 }}
                className="flex gap-3"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{body}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center gap-5 rounded-2xl border border-line bg-bg/60 p-5 backdrop-blur">
          <Rings
            size={92}
            stroke={9}
            label="Example macro rings"
            rings={[
              { value: 0.82, color: 'var(--color-protein)', label: 'Protein' },
              { value: 0.64, color: 'var(--color-carbs)', label: 'Carbs' },
              { value: 0.71, color: 'var(--color-fat)', label: 'Fat' },
            ]}
          />
          <div>
            <p className="label">Today</p>
            <p className="num font-display text-4xl font-semibold">
              1,846 <span className="text-lg text-muted">/ 2,400 kcal</span>
            </p>
            <p className="text-sm text-muted">Protein 140 g · Bench PR 102.5 kg × 3</p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h2 className="font-display text-4xl font-bold uppercase tracking-wide">{isLogin ? 'Welcome back' : 'Create account'}</h2>
          <p className="mt-2 text-muted">{isLogin ? 'Log in to keep your streak going.' : 'Start tracking in under a minute.'}</p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
            {!isLogin && (
              <Field label="Name">
                {(id) => (
                  <Input
                    id={id}
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                )}
              </Field>
            )}
            <Field label="Email">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              )}
            </Field>
            <Field label="Password" hint={isLogin ? undefined : 'At least 8 characters'}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              )}
            </Field>
            {isLogin && (
              <Link to="/forgot" className="-my-2 inline-flex min-h-11 items-center self-end text-sm font-semibold text-brand hover:underline">
                Forgot password?
              </Link>
            )}
            {submit.error && (
              <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {submit.error.message}
              </p>
            )}
            <Button type="submit" size="lg" loading={submit.isPending} className="mt-2">
              {isLogin ? 'Log in' : 'Create account'}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>

          {isLogin && (
            <Button
              variant="secondary"
              size="lg"
              className="mt-3 w-full"
              disabled={submit.isPending}
              onClick={() => submit.mutate({ name: '', email: 'demo@gymawy.app', password: 'demo1234' })}
            >
              Explore the demo account
            </Button>
          )}

          <p className="mt-8 text-center text-sm text-muted">
            {isLogin ? 'New here? ' : 'Already have an account? '}
            <Link to={isLogin ? '/register' : '/login'} className="font-semibold text-brand hover:underline">
              {isLogin ? 'Create an account' : 'Log in'}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
