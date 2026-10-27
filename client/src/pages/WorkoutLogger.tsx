import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { clsx } from 'clsx';
import { Check, ChevronRight, Clock, Dumbbell, Minus, MoreHorizontal, Plus, Timer, Trash, X } from 'lucide-react';
import { api, type Routine } from '../lib/api';
import { localDay, MUSCLE_LABEL, useMe, useUnits } from '../lib/format';
import { bodyWeightFor, estimateStrength } from '../lib/energy';
import { newSet, uid, useActiveWorkout, workoutStore, type ActiveWorkout, type DraftExercise } from '../lib/activeWorkout';
import { Button, EmptyState, IconButton, Input, Sheet, useToast } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';

function defaultName() {
  const h = new Date().getHours();
  return h < 11 ? 'Morning workout' : h < 17 ? 'Afternoon workout' : 'Evening workout';
}

export default function WorkoutLogger() {
  const active = useActiveWorkout();
  const [params, setParams] = useSearchParams();
  const { data: routines } = useQuery({ queryKey: ['routines'], queryFn: () => api.get<Routine[]>('/routines') });

  // Deep link: /train/log?routine=<id> starts that routine straight away.
  const routineId = params.get('routine');
  useEffect(() => {
    if (!routineId || active || !routines) return;
    const r = routines.find((x) => x.id === routineId);
    if (r) startRoutine(r);
    setParams({}, { replace: true });
  }, [routineId, routines, active, setParams]);

  if (!active) return <StartScreen routines={routines ?? []} />;
  return <Logger workout={active} />;
}

function startRoutine(r: Routine) {
  workoutStore.start(
    r.name,
    r.exercises.map((e) => ({
      key: uid(),
      exerciseId: e.exerciseId,
      name: e.name,
      muscleGroup: e.muscleGroup,
      sets: Array.from({ length: e.targetSets }, () => newSet('', '')),
    })),
  );
}

function StartScreen({ routines }: { routines: Routine[] }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="label">New session</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">Start a workout</h1>
      </div>
      <button
        type="button"
        onClick={() => workoutStore.start(defaultName())}
        className="glow group flex cursor-pointer items-center gap-4 rounded-[var(--radius-card)] border border-brand/40 p-5 text-left transition-transform active:scale-[0.99]"
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand text-on-brand">
          <Plus className="size-7" aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block font-display text-2xl font-semibold tracking-wide">Empty workout</span>
          <span className="text-sm text-muted">Add exercises as you go</span>
        </span>
        <ChevronRight className="size-5 text-brand transition-transform group-hover:translate-x-1" aria-hidden />
      </button>

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">From a routine</h2>
        {routines.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {routines.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => startRoutine(r)}
                  className="card flex h-full w-full cursor-pointer flex-col gap-3 p-4 text-left transition-colors hover:border-brand/40"
                >
                  <span className="flex items-center justify-between">
                    <span className="font-display text-xl font-semibold tracking-wide">{r.name}</span>
                    <span className="text-xs text-muted">{r.exercises.length} exercises</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {r.exercises.map((e) => (
                      <span key={e.exerciseId} className="rounded-md bg-surface-3 px-2 py-0.5 text-xs text-muted">
                        {e.name}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Dumbbell className="size-5" />}
            title="No routines yet"
            body="Finish a workout and save it as a routine to reuse it with one tap."
          />
        )}
      </section>
    </div>
  );
}

function Logger({ workout }: { workout: ActiveWorkout }) {
  const navigate = useNavigate();
  const toast = useToast();
  const u = useUnits();
  const { data: me } = useMe();
  const [picker, setPicker] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saveAsRoutine, setSaveAsRoutine] = useState(false);

  const doneSets = workout.exercises.flatMap((e) => e.sets.filter((s) => s.done));
  const doneVolume = workout.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.done && !s.isWarmup).reduce((m, s) => m + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0),
    0,
  );

  const minutesSoFar = () => (Date.now() - new Date(workout.startedAt).getTime()) / 60000;
  const finish = useMutation({
    mutationFn: async () => {
      const exercises = workout.exercises
        .map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets
            .filter((s) => s.done)
            .map((s) => ({ reps: Number(s.reps) || 0, weightKg: u.toKg(Number(s.weight) || 0), isWarmup: s.isWarmup })),
        }))
        .filter((e) => e.sets.length);
      const res = await api.post<{ id: string }>('/workouts', {
        name: workout.name.trim() || defaultName(),
        date: localDay(new Date(workout.startedAt)),
        startedAt: workout.startedAt,
        endedAt: new Date().toISOString(),
        calories: estimateStrength(minutesSoFar(), bodyWeightFor(me)),
        exercises,
      });
      if (saveAsRoutine) {
        await api.post('/routines', {
          name: workout.name.trim() || defaultName(),
          exercises: workout.exercises
            .filter((e) => e.sets.some((s) => s.done))
            .map((e) => ({
              exerciseId: e.exerciseId,
              targetSets: e.sets.filter((s) => !s.isWarmup).length || 1,
              targetReps: Number(e.sets.find((s) => !s.isWarmup)?.reps) || 10,
            })),
        });
      }
      return res;
    },
    onSuccess: ({ id }) => {
      workoutStore.discard();
      toast('Workout saved. Nice work!');
      navigate(`/train/workouts/${id}`, { replace: true });
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const set = (fn: (w: ActiveWorkout) => ActiveWorkout) => workoutStore.update(fn);
  const updateExercise = (key: string, fn: (e: DraftExercise) => DraftExercise) =>
    set((w) => ({ ...w, exercises: w.exercises.map((e) => (e.key === key ? fn(e) : e)) }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* Header */}
      <div className="sticky top-[61px] z-20 -mx-4 border-b border-line/60 bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="wname" className="sr-only">
              Workout name
            </label>
            <input
              id="wname"
              value={workout.name}
              onChange={(e) => set((w) => ({ ...w, name: e.target.value }))}
              className="w-full truncate bg-transparent font-display text-2xl font-bold uppercase tracking-wide outline-none focus:text-brand sm:text-3xl"
            />
            <p className="num flex items-center gap-3 text-sm text-muted">
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                <ElapsedClock since={workout.startedAt} />
              </span>
              <span>{doneSets.length} sets</span>
              <span>
                {Math.round(doneVolume).toLocaleString()} {u.w}
              </span>
            </p>
          </div>
          <IconButton label="Discard workout" onClick={() => setConfirmDiscard(true)}>
            <Trash className="size-5" />
          </IconButton>
          <Button onClick={() => setConfirmFinish(true)} disabled={!doneSets.length}>
            Finish
          </Button>
        </div>
      </div>

      {/* Exercises */}
      <AnimatePresence initial={false}>
        {workout.exercises.map((ex) => (
          <motion.div key={ex.key} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }}>
            <ExerciseBlock
              ex={ex}
              onChange={(fn) => updateExercise(ex.key, fn)}
              onRemove={() => set((w) => ({ ...w, exercises: w.exercises.filter((e) => e.key !== ex.key) }))}
              onSetDone={() => set((w) => ({ ...w, restEndsAt: Date.now() + w.restSeconds * 1000 }))}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {!workout.exercises.length && (
        <EmptyState
          icon={<Dumbbell className="size-5" />}
          title="Add your first exercise"
          body="Pick from the library or create your own."
        />
      )}

      <Button variant="secondary" size="lg" icon={<Plus className="size-5" aria-hidden />} onClick={() => setPicker(true)}>
        Add exercises
      </Button>

      <ExercisePicker
        open={picker}
        multi
        onClose={() => setPicker(false)}
        exclude={workout.exercises.map((e) => e.exerciseId)}
        onPick={(picked) =>
          set((w) => ({
            ...w,
            exercises: [
              ...w.exercises,
              ...picked.map((p) => ({ key: uid(), exerciseId: p.id, name: p.name, muscleGroup: p.muscleGroup, sets: [newSet(), newSet(), newSet()] })),
            ],
          }))
        }
      />

      <RestTimer workout={workout} />

      <Sheet
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title="Finish workout?"
        footer={
          <Button className="w-full" size="lg" loading={finish.isPending} onClick={() => finish.mutate()}>
            Save workout
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-center">
          <SummaryStat label="Duration" value={<ElapsedClock since={workout.startedAt} />} />
          <SummaryStat label="Burned (est.)" value={`${estimateStrength(minutesSoFar(), bodyWeightFor(me))} kcal`} />
          <SummaryStat label="Sets" value={doneSets.length} />
          <SummaryStat label={`Volume (${u.w})`} value={Math.round(doneVolume).toLocaleString()} />
        </div>
        {workout.exercises.some((e) => e.sets.some((s) => !s.done)) && (
          <p className="mt-4 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">Unticked sets won’t be saved.</p>
        )}
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line p-3">
          <input
            type="checkbox"
            checked={saveAsRoutine}
            onChange={(e) => setSaveAsRoutine(e.target.checked)}
            className="size-5 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block text-sm font-semibold">Save as routine</span>
            <span className="block text-xs text-muted">Start this exact workout again with one tap</span>
          </span>
        </label>
      </Sheet>

      <Sheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard workout?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDiscard(false)}>
              Keep going
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                workoutStore.discard();
                navigate('/train');
              }}
            >
              Discard
            </Button>
          </div>
        }
      >
        <p className="text-muted">All sets logged in this session will be lost.</p>
      </Sheet>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <p className="num font-display text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function ElapsedClock({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <span className="num">
      {h ? `${h}:${String(m).padStart(2, '0')}` : m}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

type LastSets = { date: string; sets: { reps: number; weightKg: number; isWarmup: boolean }[] } | null;

function ExerciseBlock({
  ex,
  onChange,
  onRemove,
  onSetDone,
}: {
  ex: DraftExercise;
  onChange: (fn: (e: DraftExercise) => DraftExercise) => void;
  onRemove: () => void;
  onSetDone: () => void;
}) {
  const u = useUnits();
  const [menu, setMenu] = useState(false);
  const { data: last } = useQuery({
    queryKey: ['last', ex.exerciseId],
    queryFn: () => api.get<LastSets>(`/exercises/${ex.exerciseId}/last`),
  });
  const prev = (i: number) => last?.sets[i];

  const updateSet = (key: string, patch: Partial<DraftExercise['sets'][number]>) =>
    onChange((e) => ({ ...e, sets: e.sets.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));

  return (
    <section className="card overflow-hidden p-0">
      <div className="flex items-center gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <Link to={`/train/exercises/${ex.exerciseId}`} className="block truncate font-display text-xl font-semibold tracking-wide text-brand hover:underline">
            {ex.name}
          </Link>
          <p className="text-xs text-muted">
            {MUSCLE_LABEL[ex.muscleGroup]}
            {last && ` · last time ${last.sets.filter((s) => !s.isWarmup).length} sets`}
          </p>
        </div>
        <div className="relative">
          <IconButton label={`Options for ${ex.name}`} onClick={() => setMenu((m) => !m)}>
            <MoreHorizontal className="size-5" />
          </IconButton>
          {menu && (
            <div className="absolute right-0 top-11 z-10 w-44 rounded-xl border border-line-strong bg-surface-2 p-1 shadow-xl shadow-black/50">
              <button
                type="button"
                onClick={onRemove}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-danger/10"
              >
                <Trash className="size-4" aria-hidden /> Remove exercise
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[2.25rem_1fr_minmax(0,5.5rem)_minmax(0,4.5rem)_2.75rem] items-center gap-x-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">
        <span className="text-center">Set</span>
        <span>Previous</span>
        <span className="text-center">{u.w}</span>
        <span className="text-center">Reps</span>
        <span className="sr-only">Done</span>
      </div>

      <ul>
        <AnimatePresence initial={false}>
          {ex.sets.map((s, i) => {
            const p = prev(i);
            const prevWeight = p ? String(u.weight(p.weightKg)) : '';
            const prevReps = p ? String(p.reps) : '';
            const workingIndex = ex.sets.slice(0, i + 1).filter((x) => !x.isWarmup).length;
            return (
              <motion.li
                key={s.key}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={clsx(
                  'grid grid-cols-[2.25rem_1fr_minmax(0,5.5rem)_minmax(0,4.5rem)_2.75rem] items-center gap-x-2 px-3 py-1.5 transition-colors',
                  s.done && 'bg-brand/8',
                )}
              >
                <button
                  type="button"
                  onClick={() => updateSet(s.key, { isWarmup: !s.isWarmup })}
                  aria-label={s.isWarmup ? `Warm-up set, tap to make set ${i + 1} a working set` : `Set ${workingIndex}, tap to mark as warm-up`}
                  className={clsx(
                    'num flex size-9 cursor-pointer items-center justify-center rounded-lg text-sm font-bold',
                    s.isWarmup ? 'bg-warn/15 text-warn' : 'bg-surface-3 text-fg',
                  )}
                >
                  {s.isWarmup ? 'W' : workingIndex}
                </button>
                <button
                  type="button"
                  disabled={!p}
                  onClick={() => updateSet(s.key, { weight: prevWeight, reps: prevReps })}
                  className="num truncate text-left text-sm text-muted enabled:cursor-pointer enabled:hover:text-fg"
                  aria-label={p ? `Copy previous: ${prevWeight} ${u.w} for ${prevReps} reps` : 'No previous set'}
                >
                  {p ? `${prevWeight} × ${prevReps}` : '—'}
                </button>
                <Input
                  inputMode="decimal"
                  aria-label={`Set ${i + 1} weight in ${u.w}`}
                  value={s.weight}
                  placeholder={prevWeight || '0'}
                  onChange={(e) => updateSet(s.key, { weight: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })}
                  className="num min-h-10 px-1 text-center font-semibold"
                />
                <Input
                  inputMode="numeric"
                  aria-label={`Set ${i + 1} reps`}
                  value={s.reps}
                  placeholder={prevReps || '0'}
                  onChange={(e) => updateSet(s.key, { reps: e.target.value.replace(/\D/g, '') })}
                  className="num min-h-10 px-1 text-center font-semibold"
                />
                <button
                  type="button"
                  aria-pressed={s.done}
                  aria-label={s.done ? `Set ${i + 1} done` : `Mark set ${i + 1} done`}
                  onClick={() => {
                    // Ticking an empty set accepts the greyed-out previous values.
                    const weight = s.weight || prevWeight;
                    const reps = s.reps || prevReps;
                    if (!s.done && !reps) return;
                    updateSet(s.key, { done: !s.done, weight, reps });
                    if (!s.done) {
                      onSetDone();
                      navigator.vibrate?.(15);
                    }
                  }}
                  className={clsx(
                    'flex size-10 cursor-pointer items-center justify-center rounded-lg transition-all duration-150 active:scale-90',
                    s.done ? 'bg-brand text-on-brand' : 'bg-surface-3 text-subtle hover:text-fg',
                  )}
                >
                  <Check className="size-5" strokeWidth={3} aria-hidden />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <div className="flex gap-2 p-3">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() =>
            onChange((e) => {
              const lastSet = e.sets.at(-1);
              return { ...e, sets: [...e.sets, newSet(lastSet?.weight ?? '', lastSet?.reps ?? '')] };
            })
          }
        >
          Add set
        </Button>
        {ex.sets.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Minus className="size-4" aria-hidden />}
            onClick={() => onChange((e) => ({ ...e, sets: e.sets.slice(0, -1) }))}
          >
            Remove
          </Button>
        )}
      </div>
    </section>
  );
}

function RestTimer({ workout }: { workout: ActiveWorkout }) {
  const [now, setNow] = useState(Date.now());
  const ends = workout.restEndsAt;
  useEffect(() => {
    if (!ends) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [ends]);

  const left = ends ? Math.ceil((ends - now) / 1000) : 0;
  useEffect(() => {
    if (ends && left <= 0) {
      navigator.vibrate?.([120, 80, 120]);
      workoutStore.update((w) => ({ ...w, restEndsAt: null }));
    }
  }, [ends, left]);

  const adjust = (delta: number) =>
    workoutStore.update((w) => ({
      ...w,
      restSeconds: Math.max(15, w.restSeconds + delta),
      restEndsAt: w.restEndsAt ? w.restEndsAt + delta * 1000 : null,
    }));

  const pct = ends ? Math.max(0, Math.min(1, left / workout.restSeconds)) : 0;

  return (
    <AnimatePresence>
      {ends && left > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md lg:bottom-6"
          role="timer"
          aria-live="off"
        >
          <div className="relative overflow-hidden rounded-2xl border border-brand/40 bg-surface-2/95 shadow-2xl shadow-black/70 backdrop-blur-xl">
            <div className="absolute inset-y-0 left-0 bg-brand/15" style={{ width: `${pct * 100}%`, transition: 'width 250ms linear' }} />
            <div className="relative flex items-center gap-2 p-2 pl-4">
              <Timer className="size-5 text-brand" aria-hidden />
              <span className="flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wider text-muted">Rest</span>
                <span className="num font-display text-2xl font-bold leading-none">
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => adjust(-15)} aria-label="Rest 15 seconds less">
                −15
              </Button>
              <Button variant="ghost" size="sm" onClick={() => adjust(15)} aria-label="Rest 15 seconds more">
                +15
              </Button>
              <IconButton label="Skip rest" onClick={() => workoutStore.update((w) => ({ ...w, restEndsAt: null }))}>
                <X className="size-5" />
              </IconButton>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
