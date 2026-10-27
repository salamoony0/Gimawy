import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, Dumbbell, Medal, Pencil, Repeat, Trophy, Weight } from 'lucide-react';
import { api, type Exercise, type ExerciseHistory } from '../lib/api';
import { fmtCompact, fmtDay, MUSCLE_LABEL, relativeDay, useUnits } from '../lib/format';
import { Badge, Button, EmptyState, Field, Input, Segmented, Select, Sheet, Skeleton, useToast } from '../components/ui';
import { EQUIPMENT, MUSCLES } from '../components/ExercisePicker';
import { axisProps, ChartTooltip, GradientDefs, gridProps } from '../components/viz';

export default function ExerciseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const u = useUnits();
  const [metric, setMetric] = useState<'e1rm' | 'top' | 'volume'>('e1rm');
  const [editOpen, setEditOpen] = useState(false);
  const { data, error } = useQuery({ queryKey: ['exercise', id], queryFn: () => api.get<ExerciseHistory>(`/exercises/${id}`) });

  if (error) return <p className="text-muted">Exercise not found.</p>;
  if (!data) return <Skeleton className="h-96" />;

  const { exercise, sessions, records } = data;
  const chart = [...sessions].reverse().map((s) => ({
    date: s.date,
    e1rm: u.weight(s.e1rm),
    top: u.weight(s.topWeightKg),
    volume: u.weight(s.volume, 0),
  }));
  const first = chart[0];
  const last = chart.at(-1);
  const gain = first && last ? Math.round((last[metric] - first[metric]) * 10) / 10 : 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="-ml-2 flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded-xl px-2 text-sm font-semibold text-muted hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden /> Back
      </button>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label capitalize">
            {MUSCLE_LABEL[exercise.muscleGroup]} · {exercise.equipment}
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">{exercise.name}</h1>
        </div>
        {exercise.isCustom && (
          <div className="flex items-center gap-2">
            <Badge tone="muted">Custom exercise</Badge>
            <Button variant="secondary" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </div>
        )}
      </header>
      {exercise.isCustom && (
        <CustomExerciseSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          exercise={exercise}
          onDeleted={() => navigate('/train?tab=exercises', { replace: true })}
        />
      )}

      {!sessions.length ? (
        <EmptyState
          icon={<Dumbbell className="size-5" />}
          title="Not logged yet"
          body="Add this exercise to a workout and your strength curve and records will show here."
          action={
            <Link to="/train/log" className="font-semibold text-brand hover:underline">
              Start a workout
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Record
              icon={<Trophy className="size-4" />}
              label="Best e1RM"
              value={records.bestE1rm ? `${u.weight(records.bestE1rm.e1rm)}` : '—'}
              unit={u.w}
              sub={records.bestE1rm ? `${u.weight(records.bestE1rm.weightKg)} × ${records.bestE1rm.reps} · ${fmtDay(records.bestE1rm.date)}` : ''}
              highlight
            />
            <Record
              icon={<Weight className="size-4" />}
              label="Heaviest"
              value={records.heaviest ? `${u.weight(records.heaviest.weightKg)}` : '—'}
              unit={u.w}
              sub={records.heaviest ? `× ${records.heaviest.reps} · ${fmtDay(records.heaviest.date)}` : ''}
            />
            <Record
              icon={<Repeat className="size-4" />}
              label="Most reps"
              value={records.mostReps ? `${records.mostReps.reps}` : '—'}
              unit="reps"
              sub={records.mostReps ? `@ ${u.weight(records.mostReps.weightKg)} ${u.w}` : ''}
            />
            <Record
              icon={<Medal className="size-4" />}
              label="Best volume"
              value={records.bestVolume ? fmtCompact(u.weight(records.bestVolume.volume, 0)) : '—'}
              unit={u.w}
              sub={records.bestVolume ? fmtDay(records.bestVolume.date) : ''}
            />
          </div>

          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold tracking-wide">Progress</h2>
                {chart.length > 1 && (
                  <p className="num text-sm text-muted">
                    <span className={gain >= 0 ? 'font-semibold text-brand' : 'font-semibold text-danger'}>
                      {gain >= 0 ? '+' : ''}
                      {gain} {u.w}
                    </span>{' '}
                    since {fmtDay(first!.date)}
                  </p>
                )}
              </div>
              <Segmented
                label="Chart metric"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'e1rm', label: 'e1RM' },
                  { value: 'top', label: 'Top set' },
                  { value: 'volume', label: 'Volume' },
                ]}
              />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <GradientDefs id="exgrad" color="var(--color-brand)" />
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDay(d)} minTickGap={24} />
                  <YAxis {...axisProps} domain={metric === 'volume' ? [0, 'auto'] : ['dataMin - 5', 'dataMax + 5']} width={48} tickFormatter={fmtCompact} />
                  <Tooltip
                    cursor={{ stroke: 'var(--color-line-strong)' }}
                    content={<ChartTooltip labelFormat={(d) => fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' })} format={(v) => `${v} ${u.w}`} />}
                  />
                  {metric === 'volume' ? (
                    <Bar dataKey="volume" name="Volume" fill="var(--color-brand)" radius={[5, 5, 1, 1]} maxBarSize={22} />
                  ) : (
                    <>
                      <Area type="monotone" dataKey={metric} name={metric === 'e1rm' ? 'Est. 1RM' : 'Top set'} stroke="none" fill="url(#exgrad)" />
                      <Line
                        type="monotone"
                        dataKey={metric}
                        name={metric === 'e1rm' ? 'Est. 1RM' : 'Top set'}
                        stroke="var(--color-brand)"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: 'var(--color-bg)', stroke: 'var(--color-brand)', strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                        legendType="none"
                        tooltipType="none"
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-subtle">e1RM = estimated one-rep max (Epley formula) from your best set each session.</p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">History</h2>
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => (
                <li key={s.workoutId}>
                  <Link to={`/train/workouts/${s.workoutId}`} className="card flex flex-col gap-2 p-4 transition-colors hover:border-brand/40 sm:flex-row sm:items-center">
                    <div className="min-w-0 sm:w-44">
                      <p className="flex items-center gap-2 font-semibold">
                        {relativeDay(s.date)}
                        {s.isPr && (
                          <Badge tone="pr">
                            <Trophy className="size-3" aria-hidden /> PR
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted">{s.workoutName}</p>
                    </div>
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {s.sets.map((set) => (
                        <span
                          key={set.id}
                          className={
                            set.isPr
                              ? 'num rounded-lg bg-pr/15 px-2 py-1 text-xs font-semibold text-pr'
                              : set.isWarmup
                                ? 'num rounded-lg bg-surface-2 px-2 py-1 text-xs text-subtle'
                                : 'num rounded-lg bg-surface-3 px-2 py-1 text-xs font-semibold'
                          }
                        >
                          {u.weight(set.weightKg)}×{set.reps}
                        </span>
                      ))}
                    </div>
                    <p className="num text-sm text-muted sm:text-right">
                      e1RM <span className="font-display text-lg font-semibold text-fg">{u.weight(s.e1rm)}</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Record({
  icon,
  label,
  value,
  unit,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? 'card glow border-brand/30 p-4' : 'card p-4'}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        <span className="text-brand">{icon}</span>
        {label}
      </p>
      <p className="num mt-1 font-display text-3xl font-semibold">
        {value} <span className="text-sm font-medium text-muted">{unit}</span>
      </p>
      <p className="num truncate text-xs text-muted">{sub}</p>
    </div>
  );
}

function CustomExerciseSheet({
  open,
  onClose,
  exercise,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  exercise: Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'equipment'>;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ name: exercise.name, muscleGroup: exercise.muscleGroup, equipment: exercise.equipment });
  const save = useMutation({
    mutationFn: () => api.patch(`/exercises/${exercise.id}`, { ...f, name: f.name.trim() }),
    onSuccess: () => {
      toast('Exercise updated');
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const del = useMutation({
    mutationFn: () => api.del(`/exercises/${exercise.id}`),
    onSuccess: () => {
      toast('Exercise deleted');
      onClose();
      onDeleted();
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit exercise"
      footer={
        <Button className="w-full" size="lg" disabled={f.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()}>
          Save changes
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Muscle group">
            {(id) => (
              <Select id={id} value={f.muscleGroup} onChange={(e) => setF({ ...f, muscleGroup: e.target.value })}>
                {MUSCLES.map((m) => (
                  <option key={m} value={m}>
                    {MUSCLE_LABEL[m]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Equipment">
            {(id) => (
              <Select id={id} value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })}>
                {EQUIPMENT.map((m) => (
                  <option key={m} value={m}>
                    {m[0].toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="mt-2 border-t border-line pt-4">
          <Button variant="danger" className="w-full" loading={del.isPending} onClick={() => del.mutate()}>
            Delete exercise
          </Button>
          {del.error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {del.error.message}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
