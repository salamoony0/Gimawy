import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, MailCheck } from 'lucide-react';
import { api, type User } from '../lib/api';
import { Logo } from '../components/Layout';
import { Button, Field, Input } from '../components/ui';

/** /forgot asks for an email; /reset?token=… (the emailed link) sets a new password and signs in. */
export default function Recover({ mode }: { mode: 'forgot' | 'reset' }) {
  return (
    <div className="grid-bg flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <Logo className="mb-10" />
        {mode === 'forgot' ? <Forgot /> : <Reset />}
        <p className="mt-8 text-center text-sm text-muted">
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      {error.message}
    </p>
  );
}

function Forgot() {
  const [email, setEmail] = useState('');
  const send = useMutation({ mutationFn: () => api.post('/auth/forgot', { email }) });

  if (send.isSuccess) {
    return (
      <div role="status">
        <span className="flex size-12 items-center justify-center rounded-xl bg-brand/15 text-brand">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-4xl font-bold uppercase tracking-wide">Check your email</h1>
        <p className="mt-2 text-muted">
          If an account exists for <span className="font-semibold text-fg">{email}</span>, a reset link is on its way. It works for 1 hour.
        </p>
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate();
  };

  return (
    <>
      <h1 className="font-display text-4xl font-bold uppercase tracking-wide">Forgot password</h1>
      <p className="mt-2 text-muted">Enter your email and we’ll send you a link to choose a new one.</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        <Field label="Email">
          {(id) => (
            <Input id={id} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          )}
        </Field>
        <ErrorText error={send.error} />
        <Button type="submit" size="lg" loading={send.isPending} className="mt-2">
          Send reset link
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>
    </>
  );
}

function Reset() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && confirm !== password;

  const reset = useMutation({
    mutationFn: () => api.post<User>('/auth/reset', { token, password }),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      navigate(user.onboarded ? '/' : '/setup', { replace: true });
    },
  });

  if (!token) {
    return (
      <>
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide">Link incomplete</h1>
        <p className="mt-2 text-muted">This reset link is missing its token. Open the link from the email again, or request a new one.</p>
        <Link to="/forgot" className="mt-6 inline-block font-semibold text-brand hover:underline">
          Request a new link
        </Link>
      </>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!mismatch) reset.mutate();
  };

  return (
    <>
      <h1 className="font-display text-4xl font-bold uppercase tracking-wide">New password</h1>
      <p className="mt-2 text-muted">Choose a new password. Other devices will be signed out.</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        <Field label="New password" hint="At least 8 characters">
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
        </Field>
        <Field label="Confirm password" error={mismatch ? 'Passwords don’t match' : undefined}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}
        </Field>
        <ErrorText error={reset.error} />
        {reset.error && (
          <Link to="/forgot" className="text-sm font-semibold text-brand hover:underline">
            Request a new link
          </Link>
        )}
        <Button type="submit" size="lg" loading={reset.isPending} disabled={mismatch || !password} className="mt-2">
          Save and log in
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>
    </>
  );
}
