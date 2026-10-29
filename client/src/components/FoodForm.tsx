import { Trash } from 'lucide-react';
import type { FoodItem, Meal } from '../lib/api';
import { IconButton, Input } from './ui';

// Shared pieces of the food logging forms (Food page sheets and the barcode scanner).

export const MEALS: { value: Meal; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snacks' },
];

export function guessMeal(): Meal {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export const sum = (items: FoodItem[], k: 'calories' | 'protein' | 'carbs' | 'fat') => items.reduce((n, i) => n + (Number(i[k]) || 0), 0);

export type DraftItem = { name: string; quantity: string; calories: string; protein: string; carbs: string; fat: string };
export const toDraft = (i: FoodItem): DraftItem => ({
  name: i.name,
  quantity: i.quantity ?? '',
  calories: String(i.calories),
  protein: String(i.protein),
  carbs: String(i.carbs),
  fat: String(i.fat),
});
export const fromDraft = (d: DraftItem): FoodItem => ({
  name: d.name.trim() || 'Food',
  quantity: d.quantity.trim() || null,
  calories: Number(d.calories) || 0,
  protein: Number(d.protein) || 0,
  carbs: Number(d.carbs) || 0,
  fat: Number(d.fat) || 0,
});

export function ItemEditor({ item, onChange, onRemove }: { item: DraftItem; onChange: (d: DraftItem) => void; onRemove: () => void }) {
  const num = (k: keyof DraftItem, label: string, color?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold" style={{ color: color ?? 'var(--color-muted)' }}>
        {label}
      </span>
      <Input
        inputMode="decimal"
        value={item[k]}
        onChange={(e) => onChange({ ...item, [k]: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })}
        className="num min-h-10 px-2 text-center"
      />
    </label>
  );
  return (
    <li className="rounded-2xl border border-line p-3">
      <div className="flex items-start gap-2">
        <div className="grid flex-1 grid-cols-[1fr_6.5rem] gap-2">
          <Input aria-label="Food name" value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} placeholder="Food name" className="min-h-10 font-semibold" />
          <Input aria-label="Quantity" value={item.quantity} onChange={(e) => onChange({ ...item, quantity: e.target.value })} placeholder="Qty" className="min-h-10" />
        </div>
        <IconButton label={`Remove ${item.name || 'item'}`} onClick={onRemove} className="size-10">
          <Trash className="size-4" />
        </IconButton>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {num('calories', 'kcal')}
        {num('protein', 'Protein g', 'var(--color-protein)')}
        {num('carbs', 'Carbs g', 'var(--color-carbs)')}
        {num('fat', 'Fat g', 'var(--color-fat)')}
      </div>
    </li>
  );
}
