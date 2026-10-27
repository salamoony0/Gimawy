import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { clsx } from 'clsx';
import { ChevronLeft, Clock, Dumbbell, Flame, Pencil, Layers, Trash, Trophy, TrendingDown, TrendingUp } from 'lucide-react';
import { api, type WorkoutDetail as Detail } from '../lib/api';
import { fmtDay, fmtDuration, fmtInt, MUSCLE_LABEL, pctChange, useUnits } from '../lib/format';
import { Badge, Button, IconButton, Sheet, Skeleton, useToast } from '../components/ui';
import { uid, useActiveWorkout, workoutStore } from '../lib/activeWorkout';

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#4ade80',
  back: '#2dd4bf',
  shoulders: '#38bdf8',
  biceps: '#a3e635',
  triceps: '#facc15',
  legs: '#fb923c',
  glutes: '#f472b6',
  core: '#818cf8',
  'full body': '#94a29a',
};

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const u = useUnits();
  const [confirm, setConfirm] = useState(false);
  const [replaceActive, setReplaceActive] = useState(false);
  const active = useActiveWorkout();
  const { data: w, error } = useQuery({ queryKey: ['workout', id], queryFn: () => api.get<Detail>(`/workouts/${id}`) });
  const del = useMutation({
    mutationFn: () => api.del(`/workouts/${id}`),
    onSuccess: () => {
      toast('Workout deleted');
      navigate('/train', { replace: true });
    },
  });

  if (error) return <p className="text-muted">Workout not found.</p>;
  if (!w) return <Skeleton className="h-96" />;

  const edit = () => {
    workoutStore.startEdit({
      id: w.id,
      name: w.name,
      startedAt: w.startedAt,
      endedAt: w.endedAt ?? undefined,
      exercises: w.exercises.map((e) => ({
        key: uid(),
        exerciseId: e.exerciseId,
        name: e.name,
        muscleGroup: e.muscleGroup,
        sets: e.sets.map((s) => ({ key: uid(), weight: String(u.weight(s.weightKg)), reps: String(s.reps), done: true, isWarmup: s.isWarmup })),
      })),
    });
    navigate('/train/log');
  };
  const requestEdit = () => (active && active.editingId !== w.id ? setReplaceActive(true) : active ? navigate('/train/log') : edit());

  const muscleSets = new Map<string, number>();
  for (const e of w.exercises) muscleSets.set(e.muscleGroup, (muscleSets.get(e.muscleGroup) ?? 0) + e.sets.filter((s) => !s.isWarmup).length);
  const totalSets = [...muscleSets.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <Link to="/train" className="-ml-2 flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-muted hover:text-fg">
          <ChevronLeft className="size-4" aria-hidden /> Train
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={requestEdit}>
            Edit
          </Button>
          <IconButton label="Delete workout" onClick={() => setConfirm(true)}>
            <Trash className="size-5" />
          </IconButton>
        </div>
      </div>

      <header>
        <p className="label">{fmtDay(w.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">{w.name}</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <HeroStat icon={<Clock className="size-4" />} label="Duration" value={fmtDuration(w.durationMin)} />
        <HeroStat icon={<Flame className="size-4" />} label="Burned" value={w.calories != null ? `${w.calories}` : '—'} />
        <HeroStat icon={<Dumbbell className="size-4" />} label={`Volume (${u.w})`} value={fmtInt(u.weight(w.volume, 0))} />
        <HeroStat icon={<Layers className="size-4" />} label="Working sets" value={w.setCount} />
        <HeroStat icon={<Trophy className="size-4" />} label="PRs" value={w.prCount} highlight={w.prCount > 0} />
      </div>

      {/* Muscle split for this session */}
      <section className="card p-5">
        <h2 className="label mb-3">Sets by muscle</h2>
        <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={[...muscleSets].map(([m, n]) => `${MUSCLE_LABEL[m]} ${n} sets`).join(', ')}>
          {[...muscleSets].map(([m, n], i) => (
            <motion.span
              key={m}
              initial={{ width: 0 }}
              animate={{ width: `${(n / totalSets) * 100}%` }}
              transition={{ delay: i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ background: MUSCLE_COLORS[m] }}
              className="h-full border-r-2 border-surface last:border-r-0"
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {[...muscleSets].map(([m, n]) => (
            <li key={m} className="flex items-center gap-1.5 text-muted">
              <span className="size-2.5 rounded-full" style={{ background: MUSCLE_COLORS[m] }} />
              {MUSCLE_LABEL[m]} <span className="num font-semibold text-fg">{n}</span>
            </li>
          ))}
        </ul>
      </section>

      {w.exercises.map((e, i) => {
        const volDelta = e.previous ? pctChange(e.volume, e.previous.volume) : null;
        const e1Delta = e.previous ? Math.round((e.bestE1rm - e.previous.bestE1rm) * 10) / 10 : null;
        return (
          <motion.section
            key={e.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="card p-0"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 p-4 pb-2">
              <div>
                <Link to={`/train/exercises/${e.exerciseId}`} className="font-display text-xl font-semibold tracking-wide text-brand hover:underline">
                  {e.name}
                </Link>
                <p className="text-xs capitalize text-muted">
                  {MUSCLE_LABEL[e.muscleGroup]} · {e.equipment}
                </p>
              </div>
              {e.previous && (
                <div className="flex gap-2">
                  {volDelta != null && <Delta label="volume" value={`${volDelta > 0 ? '+' : ''}${volDelta}%`} up={volDelta >= 0} />}
                  {e1Delta != null && e1Delta !== 0 && (
                    <Delta label="e1RM" value={`${e1Delta > 0 ? '+' : ''}${u.weight(e1Delta)} ${u.w}`} up={e1Delta > 0} />
                  )}
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-subtle">
                  <th className="px-4 py-1.5 font-semibold">Set</th>
                  <th className="px-2 py-1.5 font-semibold">Weight</th>
                  <th className="px-2 py-1.5 font-semibold">Reps</th>
                  <th className="px-4 py-1.5 text-right font-semibold">e1RM</th>
                </tr>
              </thead>
              <tbody>
                {e.sets.map((s, j) => (
                  <tr key={s.id} className={clsx('border-t border-line/60', s.isPr && 'bg-pr/6')}>
                    <td className="px-4 py-2">
                      <span
                        className={clsx(
                          'num inline-flex size-7 items-center justify-center rounded-md text-xs font-bold',
                          s.isWarmup ? 'bg-warn/15 text-warn' : 'bg-surface-3',
                        )}
                      >
                        {s.isWarmup ? 'W' : e.sets.slice(0, j + 1).filter((x) => !x.isWarmup).length}
                      </span>
                    </td>
                    <td className="num px-2 py-2 font-semibold">
                      {u.weight(s.weightKg)} <span className="font-normal text-muted">{u.w}</span>
                    </td>
                    <td className="num px-2 py-2 font-semibold">{s.reps}</td>
                    <td className="num px-4 py-2 text-right">
                      {s.isPr && (
                        <Badge tone="pr" className="mr-2">
                          <Trophy className="size-3" aria-hidden /> PR
                        </Badge>
                      )}
                      <span className={s.isWarmup ? 'text-subtle' : 'text-muted'}>{s.isWarmup ? '—' : u.weight(s.e1rm)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="num flex justify-between border-t border-line/60 px-4 py-2.5 text-xs text-muted">
              <span>
                Volume <span className="font-semibold text-fg">{fmtInt(u.weight(e.volume, 0))} {u.w}</span>
              </span>
              {e.previous && <span>Previous: {fmtDay(e.previous.date)}</span>}
            </div>
          </motion.section>
        );
      })}

      <Sheet
        open={replaceActive}
        onClose={() => setReplaceActive(false)}
        title="Replace current workout?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => navigate('/train/log')}>
              Go to it
            </Button>
            <Button variant="danger" className="flex-1" onClick={edit}>
              Discard & edit
            </Button>
          </div>
        }
      >
        <p className="text-muted">You have “{active?.name}” open in the logger. Editing this workout will discard it.</p>
      </Sheet>

      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete workout?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" loading={del.isPending} onClick={() => del.mutate()}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-muted">This removes the workout and its sets from your history and charts. It can’t be undone.</p>
      </Sheet>
    </div>
  );
}

function HeroStat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={clsx('card p-4', highlight && 'border-pr/40 bg-pr/5')}>
      <p className={clsx('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider', highlight ? 'text-pr' : 'text-muted')}>
        {icon}
        {label}
      </p>
      <p className="num mt-1 font-display text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Delta({ label, value, up }: { label: string; value: string; up: boolean }) {
  return (
    <span className={clsx('num flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold', up ? 'bg-brand/10 text-brand' : 'bg-surface-3 text-muted')}>
      {up ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
      {value} {label}
    </span>
  );
}
