import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash, UtensilsCrossed } from 'lucide-react';
import { api, isQueued, type CustomFood, type FoodItem, type SavedMeal } from '../lib/api';
import { cleanDecimal, fmtInt, plural } from '../lib/format';
import { fromCustom, type Pickable } from '../lib/portion';
import { Button, Field, IconButton, Input, Sheet, useToast } from './ui';
import { FoodSearchResults, PortionPicker, SearchBox } from './FoodSearch';
import { fromDraft, ItemEditor, sum, type DraftItem } from './FoodForm';

/** A meal being created or edited; `id` is set when editing a saved one. */
export type MealDraft = { id?: string; name: string; items: FoodItem[] };

const EMPTY_DRAFT: DraftItem = { name: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' };

export function useMyFoods(enabled = true) {
  const custom = useQuery({ queryKey: ['food-custom'], queryFn: () => api.get<CustomFood[]>('/food/custom'), enabled });
  const meals = useQuery({ queryKey: ['food-meals'], queryFn: () => api.get<SavedMeal[]>('/food/meals'), enabled });
  return { custom: custom.data ?? [], meals: meals.data ?? [] };
}

/** My meals and my foods in the add-food sheet: tap a meal to log all of it, tap a food to pick an amount. */
export function MyFoodsLists({
  onLogMeal,
  onPickFood,
  onEditMeal,
  onEditFood,
  onCreateMeal,
  onCreateFood,
}: {
  onLogMeal: (m: SavedMeal) => void;
  onPickFood: (f: Pickable) => void;
  onEditMeal: (m: SavedMeal) => void;
  onEditFood: (f: CustomFood) => void;
  onCreateMeal: () => void;
  onCreateFood: () => void;
}) {
  const { custom, meals } = useMyFoods();
  return (
    <div className="mb-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={onCreateFood}>
          <Plus className="size-4" aria-hidden /> Create food
        </Button>
        <Button variant="secondary" size="sm" onClick={onCreateMeal}>
          <UtensilsCrossed className="size-4" aria-hidden /> Create meal
        </Button>
      </div>
      {meals.length > 0 && (
        <div>
          <p className="label mb-2">My meals</p>
          <ul className="flex flex-col gap-1.5">
            {meals.map((m) => (
              <Row
                key={m.id}
                title={m.name}
                subtitle={`${plural(m.items.length, 'item')} · ${m.items.map((i) => i.name).join(', ')}`}
                kcal={sum(m.items, 'calories')}
                onClick={() => onLogMeal(m)}
                actionLabel={`Log ${m.name}`}
                onEdit={() => onEditMeal(m)}
                editLabel={`Edit meal ${m.name}`}
              />
            ))}
          </ul>
        </div>
      )}
      {custom.length > 0 && (
        <div>
          <p className="label mb-2">My foods</p>
          <ul className="flex flex-col gap-1.5">
            {custom.map((f) => (
              <Row
                key={f.id}
                title={f.name}
                subtitle={`${f.serving} · P ${Math.round(f.protein)} · C ${Math.round(f.carbs)} · F ${Math.round(f.fat)}`}
                kcal={f.calories}
                onClick={() => onPickFood(fromCustom(f))}
                actionLabel={`Add ${f.name}`}
                onEdit={() => onEditFood(f)}
                editLabel={`Edit food ${f.name}`}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row(p: { title: string; subtitle: string; kcal: number; onClick: () => void; actionLabel: string; onEdit: () => void; editLabel: string }) {
  return (
    <li className="flex items-center gap-1 rounded-xl bg-surface-2 transition-colors hover:bg-surface-3">
      <button type="button" onClick={p.onClick} aria-label={p.actionLabel} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{p.title}</span>
          <span className="block truncate text-xs text-muted">{p.subtitle}</span>
        </span>
        <span className="num text-sm font-semibold">{fmtInt(p.kcal)}</span>
      </button>
      <IconButton label={p.editLabel} onClick={p.onEdit}>
        <Pencil className="size-4" />
      </IconButton>
    </li>
  );
}

type FoodForm = { name: string; serving: string; grams: string; calories: string; protein: string; carbs: string; fat: string };
const toForm = (f: CustomFood | null, name = ''): FoodForm =>
  f
    ? { name: f.name, serving: f.serving, grams: f.grams ? String(f.grams) : '', calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat) }
    : { name, serving: '1 serving', grams: '', calories: '', protein: '', carbs: '', fat: '' };

/** Create (food = 'new') or edit one of My foods. */
export function CustomFoodSheet({ food, initialName, onClose }: { food: CustomFood | 'new' | null; initialName?: string; onClose: () => void }) {
  const toast = useToast();
  const existing = food && food !== 'new' ? food : null;
  const [form, setForm] = useState<FoodForm>(toForm(null));
  const [loadedFor, setLoadedFor] = useState<CustomFood | 'new' | null>(null);
  if (food !== loadedFor) {
    setLoadedFor(food);
    setForm(toForm(existing, initialName));
  }
  const num = (v: string) => Number(v.replace(',', '.')) || 0;
  const body = {
    name: form.name.trim(),
    serving: form.serving.trim() || '1 serving',
    grams: num(form.grams) || null,
    calories: num(form.calories),
    protein: num(form.protein),
    carbs: num(form.carbs),
    fat: num(form.fat),
  };
  const save = useMutation({
    mutationFn: () => (existing ? api.patch(`/food/custom/${existing.id}`, body) : api.post('/food/custom', body)),
    onSuccess: () => {
      toast(existing ? `${body.name} updated` : `${body.name} added to My foods`);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/food/custom/${existing!.id}`),
    onSuccess: () => {
      toast(`${existing!.name} deleted`);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const field = (k: keyof FoodForm, label: string, numeric = true) => (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          inputMode={numeric ? 'decimal' : undefined}
          className={numeric ? 'num' : undefined}
          value={form[k]}
          onChange={(e) => setForm({ ...form, [k]: numeric ? cleanDecimal(e.target.value) : e.target.value })}
        />
      )}
    </Field>
  );

  return (
    <Sheet
      open={food !== null}
      onClose={onClose}
      title={existing ? 'Edit food' : 'Create food'}
      footer={
        <div className="flex gap-2">
          {existing && (
            <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending} aria-label={`Delete ${existing.name}`}>
              <Trash className="size-4" aria-hidden />
            </Button>
          )}
          <Button className="flex-1" size="lg" disabled={!body.name || !form.calories} loading={save.isPending} onClick={() => save.mutate()}>
            {existing ? 'Save food' : 'Add to My foods'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {field('name', 'Name', false)}
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          {field('serving', 'Serving', false)}
          {field('grams', 'Grams (optional)')}
        </div>
        <p className="-mt-2 text-xs text-muted">Nutrition for one serving. Add its weight to also log it in grams.</p>
        <div className="grid grid-cols-4 gap-2">
          {field('calories', 'kcal')}
          {field('protein', 'Protein')}
          {field('carbs', 'Carbs')}
          {field('fat', 'Fat')}
        </div>
      </div>
    </Sheet>
  );
}

/** Create or edit one of My meals: a name plus items found by search or typed in by hand. */
export function MealSheet({ meal, onClose }: { meal: MealDraft | null; onClose: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<MealDraft | null>(null);
  const [loadedFor, setLoadedFor] = useState<MealDraft | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Pickable | null>(null);
  const [manual, setManual] = useState<DraftItem | null>(null);
  if (meal !== loadedFor) {
    setLoadedFor(meal);
    setDraft(meal);
    setQuery('');
    setPicked(null);
    setManual(null);
  }
  const add = (items: FoodItem[]) => {
    setDraft((d) => d && { ...d, items: [...d.items, ...items] });
    setQuery('');
    setPicked(null);
    setManual(null);
  };

  const body = draft && { name: draft.name.trim(), items: draft.items };
  const save = useMutation({
    mutationFn: () => (draft?.id ? api.patch(`/food/meals/${draft.id}`, body) : api.post('/food/meals', body)),
    onSuccess: () => {
      toast(draft?.id ? `${body!.name} updated` : `${body!.name} added to My meals`);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/food/meals/${draft!.id}`),
    onSuccess: () => {
      toast(`${draft!.name} deleted`);
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const adding = picked || manual || query.trim();
  return (
    <Sheet
      open={meal !== null}
      onClose={onClose}
      title={draft?.id ? 'Edit meal' : 'Create meal'}
      footer={
        !adding && (
          <div className="flex gap-2">
            {draft?.id && (
              <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending} aria-label={`Delete ${draft.name}`}>
                <Trash className="size-4" aria-hidden />
              </Button>
            )}
            <Button className="flex-1" size="lg" disabled={!body?.name || !body.items.length} loading={save.isPending} onClick={() => save.mutate()}>
              {draft?.id ? 'Save meal' : 'Add to My meals'}
            </Button>
          </div>
        )
      }
    >
      {draft &&
        (picked ? (
          <PortionPicker food={picked} onBack={() => setPicked(null)} saving={false} onLog={(i) => add([i])} actionLabel={(kcal) => `Add ${fmtInt(kcal)} kcal to meal`} />
        ) : manual ? (
          <div className="flex flex-col gap-3">
            <ul>
              <ItemEditor item={manual} onChange={setManual} onRemove={() => setManual(null)} />
            </ul>
            <Button disabled={!manual.name.trim() || !manual.calories} onClick={() => add([fromDraft(manual)])}>
              Add to meal
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="Meal name">
              {(id) => <Input id={id} value={draft.name} placeholder="e.g. Egyptian breakfast" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
            </Field>
            {draft.items.length > 0 && (
              <div>
                <p className="label mb-2">
                  {plural(draft.items.length, 'item')} · {fmtInt(sum(draft.items, 'calories'))} kcal
                </p>
                <ul className="flex flex-col gap-1.5">
                  {draft.items.map((it, i) => (
                    <li key={`${it.name}-${i}`} className="flex items-center gap-2 rounded-xl bg-surface-2 pl-3">
                      <span className="min-w-0 flex-1 py-2">
                        <span className="block truncate text-sm font-semibold">{it.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {it.quantity && `${it.quantity} · `}P {Math.round(it.protein)} · C {Math.round(it.carbs)} · F {Math.round(it.fat)}
                        </span>
                      </span>
                      <span className="num text-sm font-semibold">{fmtInt(it.calories)}</span>
                      <IconButton label={`Remove ${it.name} from meal`} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}>
                        <Trash className="size-4" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="label mb-2">Add items</p>
              <SearchBox value={query} onChange={setQuery} />
            </div>
            {query.trim() ? (
              <FoodSearchResults
                query={query}
                onPick={setPicked}
                onPickMeal={(m) => add(m.items)}
                onNew={(name) => {
                  setManual({ ...EMPTY_DRAFT, name });
                  setQuery('');
                }}
              />
            ) : (
              <Button variant="ghost" onClick={() => setManual({ ...EMPTY_DRAFT })}>
                <Plus className="size-4" aria-hidden /> Add an item by hand
              </Button>
            )}
          </div>
        ))}
    </Sheet>
  );
}

/** Logging a saved meal adds each of its items as its own entry. */
export function useLogMeal(date: string, meal: string | null, onDone: () => void) {
  const toast = useToast();
  return useMutation({
    mutationFn: (m: SavedMeal) => api.offline('POST', '/food', { date, meal, source: 'meal', items: m.items }, m.name),
    onSuccess: (res, m) => {
      toast(isQueued(res) ? `${m.name} saved on this device, it will sync automatically.` : `Added ${m.name} (${fmtInt(sum(m.items, 'calories'))} kcal)`);
      onDone();
    },
    onError: (e) => toast(e.message, 'error'),
  });
}
