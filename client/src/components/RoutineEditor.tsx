import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash } from 'lucide-react';
import { api, type Routine } from '../lib/api';
import { MUSCLE_LABEL } from '../lib/format';
import { Button, Field, IconButton, Input, Sheet, useToast } from './ui';
import { ExercisePicker } from './ExercisePicker';

type Row = Routine['exercises'][number];

/** Create a routine (`routine` null) or edit an existing one. */
export function RoutineEditor({ open, routine, onClose }: { open: boolean; routine: Routine | null; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [picker, setPicker] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Reset the form whenever the sheet opens for a different routine (or for a new one).
  const key = open ? (routine?.id ?? 'new') : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    setName(routine?.name ?? '');
    setRows(routine?.exercises ?? []);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        exercises: rows.map((r) => ({ exerciseId: r.exerciseId, targetSets: r.targetSets, targetReps: r.targetReps })),
      };
      return routine ? api.put(`/routines/${routine.id}`, body) : api.post('/routines', body);
    },
    onSuccess: () => {
      toast(routine ? 'Routine updated' : 'Routine created');
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const clampInt = (v: string, max: number) => Math.max(1, Math.min(max, Number(v.replace(/\D/g, '')) || 1));

  return (
    <>
      <Sheet
        open={open && !picker}
        onClose={onClose}
        title={routine ? 'Edit routine' : 'New routine'}
        footer={
          <Button className="w-full" size="lg" disabled={!name.trim() || !rows.length} loading={save.isPending} onClick={() => save.mutate()}>
            {routine ? 'Save routine' : 'Create routine'}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day" />}</Field>

          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={`${r.exerciseId}-${i}`} className="rounded-2xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="text-xs text-muted">{MUSCLE_LABEL[r.muscleGroup]}</p>
                  </div>
                  <IconButton label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="size-9">
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton label={`Move ${r.name} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="size-9">
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton label={`Remove ${r.name}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="size-9">
                    <Trash className="size-4" />
                  </IconButton>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-sm text-muted">
                    Sets
                    <Input inputMode="numeric" value={String(r.targetSets)} onChange={(e) => update(i, { targetSets: clampInt(e.target.value, 20) })} className="num min-h-10 text-center" />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    Reps
                    <Input inputMode="numeric" value={String(r.targetReps)} onChange={(e) => update(i, { targetReps: clampInt(e.target.value, 100) })} className="num min-h-10 text-center" />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          {!rows.length && <p className="text-center text-sm text-muted">Add the exercises for this routine.</p>}
          <Button variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setPicker(true)}>
            Add exercises
          </Button>
        </div>
      </Sheet>
      <ExercisePicker
        open={picker}
        multi
        exclude={rows.map((r) => r.exerciseId)}
        onClose={() => setPicker(false)}
        onPick={(picked) =>
          setRows((rs) => [
            ...rs,
            ...picked.map((p) => ({ exerciseId: p.id, name: p.name, muscleGroup: p.muscleGroup, targetSets: 3, targetReps: 10 })),
          ])
        }
      />
    </>
  );
}
