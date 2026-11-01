import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Plus, Search, X } from 'lucide-react';
import { api, type FoodItem, type FoodSearch as FoodSearchResult, type ProductSearch, type SavedMeal } from '../lib/api';
import { fmtInt, plural } from '../lib/format';
import { fromCustom, fromDbFood, fromMine, fromProduct, portionItem, unitsFor, type Pickable } from '../lib/portion';
import { Button, Field, IconButton, Input, Select, Spinner } from './ui';

/** Fewer built-in results than this also searches Open Food Facts straight away. */
const AUTO_PRODUCTS_BELOW = 5;

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <Input
        type="search"
        aria-label="Search foods"
        placeholder="Search foods · ابحث"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-11"
        autoComplete="off"
        enterKeyHint="search"
      />
      {value && (
        <IconButton label="Clear search" onClick={() => onChange('')} className="absolute right-0 top-1/2 -translate-y-1/2">
          <X className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Results for a query: my meals, my foods, my past entries, the built-in database, then packaged products (Open Food Facts). */
export function FoodSearchResults({
  query,
  onPick,
  onPickMeal,
  onNew,
}: {
  query: string;
  onPick: (f: Pickable) => void;
  onPickMeal: (m: SavedMeal) => void;
  onNew: (name: string) => void;
}) {
  const q = useDebounced(query.trim());
  const [wantProducts, setWantProducts] = useState(false);
  useEffect(() => setWantProducts(false), [q]);

  const search = useQuery({
    queryKey: ['food-search', q],
    queryFn: () => api.get<FoodSearchResult>(`/food/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
    staleTime: 5 * 60_000,
  });
  const meals = search.data?.meals ?? [];
  const local = search.data
    ? [...search.data.custom.map(fromCustom), ...search.data.mine.map(fromMine), ...search.data.foods.map(fromDbFood)]
    : [];
  const autoProducts = search.isSuccess && local.length < AUTO_PRODUCTS_BELOW && q.length >= 2;
  const products = useQuery({
    queryKey: ['food-products', q],
    queryFn: () => api.get<ProductSearch>(`/food/search/products?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2 && (wantProducts || autoProducts),
    staleTime: 60 * 60_000,
    retry: false,
  });
  const packaged = products.data?.products.filter((p) => p.per100g).map(fromProduct) ?? [];

  if (!q || search.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (search.isError) return <p className="py-6 text-center text-sm text-muted">Search needs a connection. You can still add the food by hand.</p>;

  return (
    <div className="flex flex-col gap-4">
      {meals.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {meals.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onPickMeal(m)}
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-surface-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{m.name}</span>
                  <span className="block truncate text-xs text-muted">
                    <span className="text-subtle">My meal · </span>
                    {plural(m.items.length, 'item')}
                  </span>
                </span>
                <span className="num text-sm font-semibold">{fmtInt(m.items.reduce((n, i) => n + i.calories, 0))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {local.length > 0 && <ResultList items={local} onPick={onPick} />}
      {(products.isFetching || packaged.length > 0) && (
        <div>
          <p className="label mb-2">Packaged products</p>
          {products.isFetching ? (
            <div className="flex justify-center py-4">
              <Spinner className="size-5" />
            </div>
          ) : (
            <ResultList items={packaged} onPick={onPick} />
          )}
        </div>
      )}
      {products.isError && <p className="text-sm text-muted">{products.error.message}</p>}
      {!meals.length && !local.length && !packaged.length && !products.isFetching && <p className="py-2 text-center text-sm text-muted">No matches for “{q}”.</p>}
      <div className="flex flex-col gap-2">
        {!wantProducts && !autoProducts && q.length >= 2 && (
          <Button variant="secondary" onClick={() => setWantProducts(true)}>
            <Search className="size-4" aria-hidden /> Search packaged products
          </Button>
        )}
        <Button variant="ghost" onClick={() => onNew(q)}>
          <Plus className="size-4" aria-hidden /> Add “{q}” by hand
        </Button>
      </div>
      {(wantProducts || autoProducts) && <p className="text-center text-[11px] text-subtle">Packaged products from Open Food Facts (ODbL).</p>}
    </div>
  );
}

function ResultList({ items, onPick }: { items: Pickable[]; onPick: (f: Pickable) => void }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((f) => (
        <li key={f.key}>
          <button
            type="button"
            onClick={() => onPick(f)}
            className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-surface-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{f.name}</span>
              <span className="block truncate text-xs text-muted">
                {f.note && <span className="text-subtle">{f.note} · </span>}
                {f.base.label} · P {Math.round(f.base.protein)} · C {Math.round(f.base.carbs)} · F {Math.round(f.base.fat)}
              </span>
            </span>
            <span className="num text-sm font-semibold">{fmtInt(f.base.calories)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Pick how much of a food: a serving count, another serving, or grams. */
export function PortionPicker({
  food,
  onBack,
  onLog,
  saving,
  actionLabel = (kcal) => `Log ${fmtInt(kcal)} kcal`,
}: {
  food: Pickable;
  onBack: () => void;
  onLog: (item: FoodItem) => void;
  saving: boolean;
  actionLabel?: (kcal: number) => string;
}) {
  const units = unitsFor(food);
  const [unitIndex, setUnitIndex] = useState(0);
  const unit = units[unitIndex];
  const [amount, setAmount] = useState('1');
  const n = Number(amount) || 0;
  const item = portionItem(food, unit, n);

  const chooseUnit = (i: number) => {
    setUnitIndex(i);
    setAmount(units[i].kind === 'grams' ? String(Math.round(food.base.grams ?? 100)) : '1');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <IconButton label="Back to results" onClick={onBack} className="-ml-2">
          <ChevronLeft className="size-5" />
        </IconButton>
        <div className="min-w-0 pt-1.5">
          <p className="font-display text-xl font-semibold leading-tight tracking-wide">{food.name}</p>
          {food.note && <p className="text-xs text-muted">{food.note}</p>}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Serving">
          {(id) => (
            <Select id={id} value={unitIndex} onChange={(e) => chooseUnit(Number(e.target.value))}>
              {units.map((u, i) => (
                <option key={u.label} value={i}>
                  {u.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={unit.kind === 'grams' ? 'Grams' : 'Amount'}>
          {(id) => (
            <Input id={id} inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
          )}
        </Field>
      </div>
      {unit.kind === 'serving' && (
        <div className="flex flex-wrap gap-2">
          {['0.5', '1', '1.5', '2', '3'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(v)}
              aria-pressed={amount === v}
              className="num min-h-9 min-w-11 cursor-pointer rounded-lg border border-line-strong bg-surface-2 px-3 text-sm font-semibold hover:border-brand/50 aria-pressed:border-brand aria-pressed:text-brand"
            >
              {v === '0.5' ? '½' : v === '1.5' ? '1½' : v}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
        {(
          [
            ['kcal', item.calories, 'var(--color-fg)'],
            ['Protein', item.protein, 'var(--color-protein)'],
            ['Carbs', item.carbs, 'var(--color-carbs)'],
            ['Fat', item.fat, 'var(--color-fat)'],
          ] as const
        ).map(([label, v, color]) => (
          <div key={label}>
            <p className="num font-display text-2xl font-semibold" style={{ color }}>
              {Math.round(v)}
            </p>
            <p className="text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>

      <Button size="lg" disabled={n <= 0} loading={saving} onClick={() => onLog(item)}>
        {actionLabel(item.calories)}
      </Button>
    </div>
  );
}
