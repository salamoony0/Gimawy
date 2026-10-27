import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Check, Plus, Search } from 'lucide-react';
import { api, type Exercise } from '../lib/api';
import { MUSCLE_LABEL } from '../lib/format';
import { Badge, Button, Field, Input, Select, Sheet, Spinner } from './ui';

export const MUSCLES = Object.keys(MUSCLE_LABEL);
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other'];

export function useExercises() {
  return useQuery({ queryKey: ['exercises'], queryFn: () => api.get<Exercise[]>('/exercises'), staleTime: 5 * 60_000 });
}

export function ExercisePicker({
  open,
  onClose,
  onPick,
  multi = false,
  exclude = [],
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercises: Exercise[]) => void;
  multi?: boolean;
  exclude?: string[];
}) {
  const { data: exercises, isLoading } = useExercises();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Exercise[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', muscleGroup: 'chest', equipment: 'barbell' });

  const create = useMutation({
    mutationFn: () => api.post<Exercise>('/exercises', draft),
    onSuccess: (ex) => {
      setCreating(false);
      setDraft({ name: '', muscleGroup: 'chest', equipment: 'barbell' });
      if (multi) setSelected((s) => [...s, ex]);
      else finish([ex]);
    },
  });

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (exercises ?? [])
      .filter((e) => !exclude.includes(e.id))
      .filter((e) => !muscle || e.muscleGroup === muscle)
      .filter((e) => !term || e.name.toLowerCase().includes(term) || e.equipment.includes(term))
      .sort((a, b) => b.timesPerformed - a.timesPerformed || a.name.localeCompare(b.name));
  }, [exercises, q, muscle, exclude]);

  function finish(picked: Exercise[]) {
    onPick(picked);
    setSelected([]);
    setQ('');
    onClose();
  }

  function toggle(e: Exercise) {
    if (!multi) return finish([e]);
    setSelected((s) => (s.some((x) => x.id === e.id) ? s.filter((x) => x.id !== e.id) : [...s, e]));
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={creating ? 'New exercise' : 'Add exercise'}
      footer={
        creating ? (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCreating(false)}>
              Back
            </Button>
            <Button className="flex-1" loading={create.isPending} disabled={draft.name.trim().length < 2} onClick={() => create.mutate()}>
              Create
            </Button>
          </div>
        ) : multi ? (
          <Button className="w-full" disabled={!selected.length} onClick={() => finish(selected)}>
            Add {selected.length || ''} exercise{selected.length === 1 ? '' : 's'}
          </Button>
        ) : undefined
      }
    >
      {creating ? (
        <div className="flex flex-col gap-4 pt-1">
          <Field label="Name">
            {(id) => <Input id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Landmine Press" autoFocus />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Muscle group">
              {(id) => (
                <Select id={id} value={draft.muscleGroup} onChange={(e) => setDraft({ ...draft, muscleGroup: e.target.value })}>
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
                <Select id={id} value={draft.equipment} onChange={(e) => setDraft({ ...draft, equipment: e.target.value })} className="capitalize">
                  {EQUIPMENT.map((m) => (
                    <option key={m} value={m}>
                      {m[0].toUpperCase() + m.slice(1)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {create.error && <p className="text-sm text-danger">{create.error.message}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="sticky top-0 z-10 -mx-5 flex flex-col gap-3 bg-surface px-5 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" className="pl-9" />
            </div>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 scrollbar-none" role="group" aria-label="Filter by muscle">
              {[null, ...MUSCLES].map((m) => (
                <button
                  key={m ?? 'all'}
                  type="button"
                  aria-pressed={muscle === m}
                  onClick={() => setMuscle(m)}
                  className={clsx(
                    'min-h-9 shrink-0 cursor-pointer rounded-full border px-3.5 text-sm font-semibold transition-colors',
                    muscle === m ? 'border-brand bg-brand text-on-brand' : 'border-line-strong text-muted hover:text-fg',
                  )}
                >
                  {m ? MUSCLE_LABEL[m] : 'All'}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <ul className="flex flex-col">
              {list.map((e) => {
                const isSel = selected.some((s) => s.id === e.id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => toggle(e)}
                      className={clsx(
                        'flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-surface-2',
                        isSel && 'bg-brand/8',
                      )}
                    >
                      <span
                        className={clsx(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold uppercase',
                          isSel ? 'bg-brand text-on-brand' : 'bg-surface-3 text-muted',
                        )}
                        aria-hidden
                      >
                        {isSel ? <Check className="size-4" /> : e.name.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{e.name}</span>
                        <span className="block text-xs capitalize text-muted">
                          {MUSCLE_LABEL[e.muscleGroup]} · {e.equipment}
                        </span>
                      </span>
                      {e.isCustom && <Badge tone="muted">Custom</Badge>}
                      {e.timesPerformed > 0 && <span className="num text-xs text-subtle">{e.timesPerformed}×</span>}
                    </button>
                  </li>
                );
              })}
              {!list.length && <li className="py-8 text-center text-sm text-muted">No exercises match “{q}”.</li>}
            </ul>
          )}
          <Button variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => {
            setDraft((d) => ({ ...d, name: q }));
            setCreating(true);
          }}>
            Create custom exercise
          </Button>
        </div>
      )}
    </Sheet>
  );
}
