import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronRight, PenLine, Search, Trash, Trophy } from 'lucide-react';
import { api, type RecordRow, type RecordSet } from '../lib/api';
import { fmtDay, localDay, MUSCLE_LABEL, useUnits } from '../lib/format';
import { Badge, Button, EmptyState, Field, IconButton, Input, Segmented, Sheet, Skeleton, useToast } from './ui';
import { MUSCLES } from './ExercisePicker';

/**
 * Train → Records: every exercise by muscle group with its current best set and the record before it. Records can be
 * entered by hand (no workout needed); logged workouts update the list on their own.
 */
export function RecordsTab() {
  const u = useUnits();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'set'>('all');
  const [open, setOpen] = useState<RecordRow | null>(null);
  const { data: rows } = useQuery({ queryKey: ['records'], queryFn: () => api.get<RecordRow[]>('/records') });

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const visible = (rows ?? []).filter((r) => (filter === 'all' || r.current) && (!needle || r.name.toLowerCase().includes(needle)));
    return MUSCLES.map((m) => ({
      muscle: m,
      // Exercises with a record first, then alphabetical.
      rows: visible.filter((r) => r.muscleGroup === m).sort((a, b) => Number(!a.current) - Number(!b.current) || a.name.localeCompare(b.name)),
    })).filter((g) => g.rows.length);
  }, [rows, q, filter]);

  if (!rows) return <Skeleton className="h-96" />;
  const withRecords = rows.filter((r) => r.current).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search exercises</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="pl-10" />
        </label>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All exercises' },
            { value: 'set', label: `With records (${withRecords})` },
          ]}
        />
      </div>
      <p className="text-sm text-muted">
        Your best set for each lift, ranked by estimated 1-rep max. Tap an exercise to enter a record without logging a workout.
      </p>

      {!groups.length && (
        <EmptyState
          icon={<Trophy className="size-5" />}
          title={filter === 'set' && !q ? 'No records yet' : 'No matches'}
          body={filter === 'set' && !q ? 'Log a workout or tap any exercise under “All exercises” to enter your best set.' : 'Try another name.'}
        />
      )}

      {groups.map(({ muscle, rows }) => (
        <section key={muscle} className="card p-0">
          <h2 className="flex items-baseline justify-between px-4 pb-1 pt-3 font-display text-xl font-semibold tracking-wide">
            {MUSCLE_LABEL[muscle]}
            <span className="text-xs font-normal text-muted">
              {rows.filter((r) => r.current).length}/{rows.length} with records
            </span>
          </h2>
          <div
            className="grid grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_1rem] gap-x-2 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle"
            aria-hidden
          >
            <span>Exercise</span>
            <span>Current</span>
            <span>Previous</span>
            <span />
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.exerciseId} className="border-t border-line/60">
                <button
                  type="button"
                  onClick={() => setOpen(r)}
                  aria-label={`${r.name}: ${r.current ? `current ${setText(r.current, u)}` : 'no record'}${r.previous ? `, previous ${setText(r.previous, u)}` : ''}. Update record`}
                  className="grid min-h-14 w-full cursor-pointer grid-cols-[minmax(0,1fr)_6.5rem_5.5rem_1rem] items-center gap-x-2 px-4 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-medium leading-snug">{r.name}</span>
                    <span className="block truncate text-xs capitalize text-subtle">{r.equipment}</span>
                  </span>
                  <SetCell set={r.current} previous={r.previous} strong />
                  <SetCell set={r.previous} />
                  <ChevronRight className="size-4 text-subtle" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <RecordSheet row={open ? (rows.find((r) => r.exerciseId === open.exerciseId) ?? open) : null} onClose={() => setOpen(null)} />
    </div>
  );
}

type Units = ReturnType<typeof useUnits>;
// 0 kg is a bodyweight set (dips, pull-ups…).
const setText = (s: Pick<RecordSet, 'weightKg' | 'reps'>, u: Units) => `${s.weightKg ? `${u.weight(s.weightKg)} ${u.w}` : 'BW'} × ${s.reps}`;

function SetCell({ set, previous, strong }: { set: RecordSet | null; previous?: RecordSet | null; strong?: boolean }) {
  const u = useUnits();
  if (!set) return <span className="text-sm text-subtle">—</span>;
  const gain = previous ? u.weight(set.weightKg) - u.weight(previous.weightKg) : 0;
  return (
    <span className="min-w-0">
      <span className={clsx('num block truncate', strong ? 'font-semibold text-fg' : 'text-sm text-muted')}>
        {set.weightKg ? (
          <>
            {u.weight(set.weightKg)}
            <span className="text-xs font-normal text-muted"> {u.w}</span>
          </>
        ) : (
          'BW'
        )}{' '}
        × {set.reps}
      </span>
      <span className="num block truncate text-[11px] text-subtle">
        {fmtDay(set.date)}
        {strong && gain > 0 && <span className="text-brand"> · +{Math.round(gain * 10) / 10}</span>}
      </span>
    </span>
  );
}

function RecordSheet({ row, onClose }: { row: RecordRow | null; onClose: () => void }) {
  const u = useUnits();
  const toast = useToast();
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [date, setDate] = useState(localDay());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Reset the form whenever a different exercise is opened.
  if ((row?.exerciseId ?? null) !== loadedFor) {
    setLoadedFor(row?.exerciseId ?? null);
    setWeight('');
    setReps('');
    setDate(localDay());
  }

  const save = useMutation({
    mutationFn: () => api.post('/records', { exerciseId: row!.exerciseId, date, weightKg: u.toKg(Number(weight)), reps: Number(reps) }),
    onSuccess: () => {
      toast(`Record saved for ${row!.name}`);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/records/${id}`),
    onSuccess: () => toast('Record removed'),
    onError: (e) => toast(e.message, 'error'),
  });

  const valid = Number(weight) >= 0 && weight !== '' && Number(reps) >= 1 && Boolean(date);

  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={row ? row.name : 'Record'}
      footer={
        <Button className="w-full" size="lg" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()} icon={<PenLine className="size-4" aria-hidden />}>
          Save record
        </Button>
      }
    >
      {row && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="label">Current</p>
              <p className="num font-display text-2xl font-semibold">{row.current ? setText(row.current, u) : '—'}</p>
              {row.current && (
                <p className="num text-xs text-muted">
                  {fmtDay(row.current.date, { month: 'short', day: 'numeric', year: 'numeric' })} · e1RM {u.weight(row.current.e1rm)}
                </p>
              )}
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="label">Previous</p>
              <p className="num font-display text-2xl font-semibold text-muted">{row.previous ? setText(row.previous, u) : '—'}</p>
              {row.previous && <p className="num text-xs text-muted">{fmtDay(row.previous.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
            </div>
          </div>
          {row.current?.source === 'workout' && row.current.workoutId && (
            <Link to={`/train/workouts/${row.current.workoutId}`} className="-mt-2 text-sm font-semibold text-brand hover:underline">
              See the workout it came from
            </Link>
          )}

          <p className="label -mb-2">New record</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Weight (${u.w})`}>
              {(id) => <Input id={id} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} className="num" />}
            </Field>
            <Field label="Reps">
              {(id) => <Input id={id} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, '').slice(0, 4))} className="num" />}
            </Field>
          </div>
          <Field label="Date" hint="Logged workouts update records automatically; use this for lifts you didn’t log.">
            {(id) => <Input id={id} type="date" max={localDay()} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>

          {row.manual.length > 0 && (
            <div>
              <p className="label mb-2">Entered by hand</p>
              <ul className="flex flex-col gap-1.5">
                {row.manual.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl bg-surface-2 py-1 pl-3">
                    <span className="num flex-1 text-sm">
                      <span className="font-semibold">{setText(m, u)}</span> <span className="text-muted">· {fmtDay(m.date)}</span>
                    </span>
                    {row.current?.recordId === m.id && <Badge tone="pr">Current</Badge>}
                    <IconButton label={`Remove ${setText(m, u)} from ${fmtDay(m.date)}`} onClick={() => del.mutate(m.id)} className="size-10">
                      <Trash className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
